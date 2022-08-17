# Nacos

此Nacos笔记基于Nacos版本[2.1.0 (Apr 29, 2022)](https://github.com/alibaba/nacos/releases/tag/2.1.0)。

## 编译Nacos源码

- 从同性交友网站上将Nacos导入IDEA

- 首先IDEA需要安装`Protobuf Support`插件（`protobuf`是一种数据交换格式，又称PB编码，由Google开源），安装后通过`protobuf`编译将`proto`生成`java`文件

  ![image-20220730170109543](https://raw.githubusercontent.com/stone-98/picture-bed/main/img/202207301701724.png)

- 在nacos目录下执行`mvn -Prelease-nacos -Dmaven.test.skip=true clean install -U `
- 在console模块中找到Nacos启动类新增VM options：`-Dnacos.standalone=true`单机版启动Nacos
- 此方式启动模式是单机版启动并且使用的是内置数据库，对于初学Nacos已经足以。

## Nacos服务注册原理

Nacos在2.0版本之前都是通过HTTP的方式去注册服务，在2.0版本新增Grpc的方式。

### Nacos集成SpringCloudAlibaba服务注册原理入口

### V1版本服务注册原理——Client

### V1版本服务注册原理——Server

### spring-cloud-sarter-alibaba-nacos-discovery初始化Grpc连接流程

spring-cloud-starter-alibaba-nacos-discovery通过com.alibaba.cloud.nacos.discovery.NacosWatch实现org.springframework.context.SmartLifecycle接口来初始化启动、停止Nacos组件。

```java
public class NacosWatch
		implements ApplicationEventPublisherAware, SmartLifecycle, DisposableBean {
    @Override
	public void start() {
		if (this.running.compareAndSet(false, true)) {
			EventListener eventListener = listenerMap.computeIfAbsent(buildKey(),
					event -> new EventListener() {
						@Override
						public void onEvent(Event event) {
							if (event instanceof NamingEvent) {
								List<Instance> instances = ((NamingEvent) event)
										.getInstances();
								Optional<Instance> instanceOptional = selectCurrentInstance(
										instances);
								instanceOptional.ifPresent(currentInstance -> {
									resetIfNeeded(currentInstance);
								});
							}
						}
					});
			// 初始化NacosService
			NamingService namingService = nacosServiceManager
					.getNamingService(properties.getNacosProperties());
			try {
				namingService.subscribe(properties.getService(), properties.getGroup(),
						Arrays.asList(properties.getClusterName()), eventListener);
			}
			catch (Exception e) {
				log.error("namingService subscribe failed, properties:{}", properties, e);
			}

			this.watchFuture = this.taskScheduler.scheduleWithFixedDelay(
					this::nacosServicesWatch, this.properties.getWatchDelay());
		}
	}
}
```

NacosServiceManager是对NamingService进行管理的类，委托调用Nacos的api去创建NamingService

```java
public class NacosServiceManager {
    public NamingService getNamingService(Properties properties) {
        // 如果namingService为空，则创建NamingService
        if (Objects.isNull(this.namingService)) {
            buildNamingService(properties);
        }
        return namingService;
	}
    
    private NamingService buildNamingService(Properties properties) {
		if (Objects.isNull(namingService)) {
			synchronized (NacosServiceManager.class) {
				if (Objects.isNull(namingService)) {
                      // 创建namingService
					namingService = createNewNamingService(properties);
				}
			}
		}
		return namingService;
	}
    
    private NamingService createNewNamingService(Properties properties) {
		try {
             // 调用com.alibaba.nacos.api.NacosFactory#createNamingService(java.util.Properties)创建namingService
			return createNamingService(properties);
		}
		catch (NacosException e) {
			throw new RuntimeException(e);
		}
	}
}
```



### Nacos关于Grpc的封装

在Nacos2.0版本之后，Nacos支持了Grpc的通讯，如果有同学对于Grpc不了解，请先行了解[Grpc](https://grpc.io/)。

#### Server

整体概览：

![image-20220807113056073](C:\Users\stone-98\AppData\Roaming\Typora\typora-user-images\image-20220807113056073.png)

- BaseRpcServer：定义了基本的服务启动以及关闭的接口。
- BaseGrpcServer：实现了基本的Server模块的功能。
- GrpcClusterServer：用于集群中节点的交互。
- GrpcSdkServer：用于客户端和服务端的交互。

#### Client

整体概览：

![image-20220807152011476](C:\Users\stone-98\AppData\Roaming\Typora\typora-user-images\image-20220807152011476.png)

##### RpcClient

在Client端，它的整体层次和Server端是类似的，不同的是RpcServer单单定义接口，但是RpcClient不仅定义了接口，还提供了诸多的实现，例如:

- 消息发送
- 服务器列表改变，重新连接下一个服务器
- ......

```java
public abstract class RpcClient implements Closeable {
    // 连接以及断开连接事件的阻塞队列
    protected BlockingQueue<ConnectionEvent> eventLinkedBlockingQueue = new LinkedBlockingQueue<>();
    // rpcClient的启动状态
    protected volatile AtomicReference<RpcClientStatus> rpcClientStatus = new AtomicReference<>(
        RpcClientStatus.WAIT_INIT);
    // 重新连接信号的阻塞队列
    private final BlockingQueue<ReconnectContext> reconnectionSignal = new ArrayBlockingQueue<>(1);
    // 服务可用列表变化，判断当前的连接的服务是否在服务可用列表中，如果不在则放入reconnectionSignal中，开始重新连接
    public void onServerListChange() {...}
    // 将rpcClient启动状态置为STARTING
    // 初始化一个线程池处理eventLinkedBlockingQueue中的事件,通知对于的listener
    // 初始化一个线程池处理reconnectionSignal中的重新连接的信号
    public final void start() throws NacosException { ... }
}
```



##### GrpcClient

在RpcClient中定义了基本客户端与远端服务器通讯功能的抽象，而具体的通讯实现则由下面的具体实现来负责。

GrpcClient负责与远程服务器建立连接，创建一个GrpcConnection的对象，并初始化Grpc一元请求的stub以及双向流的stub，并且将他们以及初始化的Channel注入到GrpcConnection中，随后发送一个连接建立的请求，在服务端注册自己的连接。

```java
public abstract class GrpcClient extends RpcClient {	
    @Override
    public Connection connectToServer(ServerInfo serverInfo) {
        try {
            // 如果grpcExecutor为空，则初始化
            if (grpcExecutor == null) {
                this.grpcExecutor = createGrpcExecutor(serverInfo.getServerIp());
            }
            // 获取暴漏的端口
            int port = serverInfo.getServerPort() + rpcPortOffset();
            // 初始化一元请求调用的stub
            RequestGrpc.RequestFutureStub newChannelStubTemp = createNewChannelStub(serverInfo.getServerIp(), port);
            if (newChannelStubTemp != null) {
                // 检查stub是否有效，如果无效直接shuntDown channel
                Response response = serverCheck(serverInfo.getServerIp(), port, newChannelStubTemp);
                if (response == null || !(response instanceof ServerCheckResponse)) {
                    shuntDownChannel((ManagedChannel) newChannelStubTemp.getChannel());
                    return null;
                }
                // 初始化双向流stub
                BiRequestStreamGrpc.BiRequestStreamStub biRequestStreamStub = BiRequestStreamGrpc
                    .newStub(newChannelStubTemp.getChannel());
                // 初始化grpcConn
                GrpcConnection grpcConn = new GrpcConnection(serverInfo, grpcExecutor);
                // 将响应的response中的connectId设置到grpcConn中
                grpcConn.setConnectionId(((ServerCheckResponse) response).getConnectionId());

                // create stream request and bind connection event to this connection.
                // 创建双向流并且将双向流绑定到grpcConn
                StreamObserver<Payload> payloadStreamObserver = bindRequestStream(biRequestStreamStub, grpcConn);

                // stream observer to send response to server
                // 设置双向流到grpcConn中
                grpcConn.setPayloadStreamObserver(payloadStreamObserver);
                // 设置单向流到grpcConn中
                grpcConn.setGrpcFutureServiceStub(newChannelStubTemp);
                // 设置channel到grpcConn中
                grpcConn.setChannel((ManagedChannel) newChannelStubTemp.getChannel());
                // send a  setup request.
                // 向服务器发送设置双向流请求
                ConnectionSetupRequest conSetupRequest = new ConnectionSetupRequest();
                conSetupRequest.setClientVersion(VersionUtils.getFullClientVersion());
                conSetupRequest.setLabels(super.getLabels());
                conSetupRequest.setAbilities(super.clientAbilities);
                conSetupRequest.setTenant(super.getTenant());
                grpcConn.sendRequest(conSetupRequest);
                // wait to register connection setup
                // TODO stone-98 应该是等待服务端设置
                Thread.sleep(100L);
                return grpcConn;
            }
            return null;
        } catch (Exception e) {
            LOGGER.error("[{}]Fail to connect to server!,error={}", GrpcClient.this.getName(), e);
        }
        return null;
    }
}
```

##### GrpcConnect

整体概览：

![image-20220808222411675](C:\Users\stone-98\AppData\Roaming\Typora\typora-user-images\image-20220808222411675.png)

- Requester：定义了基本的请求接口
- Connection：继承了Requester接口，在Requester接口的基础上扩展了connectionId、isAbandon字段
- GrpcConnection：对Connection进行了实现



### V2版本服务注册原理——Client

### V2版本服务注册原理——Server

## Nacos相关包的作用

使用Nacos分别需要导入如下两个包:

```pom
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-config</artifactId>
</dependency>
```

- spring-cloud-starter-alibaba-nacos-discovery：该项目通过自动配置以及其他 Spring 编程模型的习惯用法为 Spring Boot 应用程序在服务注册与发现方面提供和 Nacos 的无缝集成。
- spring-cloud-starter-alibaba-nacos-config：Nacos 提供用于存储配置和其他元数据的 key/value 存储，为分布式系统中的外部化配置提供服务器端和客户端支持。

## 服务注册原理分析

注册注册的入口是org.springframework.cloud.client.serviceregistry.AbstractAutoServiceRegistration#bind监听org.springframework.boot.web.context.WebServerInitializedEvent事件，当WebServer初始化完毕之后发生回调bind（）方法。

分析关键类AbstractAutoServiceRegistartion(由于篇幅原因，仅分析大概流程，不详细讲解每个方法)：

```java
public abstract class AbstractAutoServiceRegistration<R extends Registration>
		implements AutoServiceRegistration, ApplicationContextAware {
    private ApplicationContext context;
    private Environment environment;
    private final ServiceRegistry<R> serviceRegistry;
	private AutoServiceRegistrationProperties properties;
    
    @EventListener(WebServerInitializedEvent.class)
    public void bind(WebServerInitializedEvent event) {
        ApplicationContext context = event.getApplicationContext();
        // TODO 为什么要这样处理？
		if (context instanceof ConfigurableWebServerApplicationContext) {
			if ("management".equals(
					((ConfigurableWebServerApplicationContext) context).getServerNamespace())) {
				return;
			}
		}
		this.port.compareAndSet(0, event.getWebServer().getPort());
		this.start();
    }
    
    public void start() {
        // 如果未开启服务注册，直接处理完成
        if (!isEnabled()) {
			if (logger.isDebugEnabled()) {
				logger.debug("Discovery Lifecycle disabled. Not starting");
			}
			return;
		}

		// only initialize if nonSecurePort is greater than 0 and it isn't already running
		// because of containerPortInitializer below
		if (!this.running.get()) {
             // 依托serviceRegistry实现注册
			register();
             // TODO？
			if (shouldRegisterManagement()) {
				registerManagement();
			}
             // 自身注册之后发布事件
			this.context.publishEvent(new InstanceRegisteredEvent<>(this, getConfiguration()));
             // 修改运行状态
			this.running.compareAndSet(false, true);
		}
    }
    public void stop() {}
}
```

AbstractAutoServiceRegistration中有两个属性AutoServiceRegistrationProperties、ServiceRegistry，我们从字面基本上能猜测出，AbstractAutoServiceRegistration通过AutoServiceRegistrationProperties的属性依托ServiceRegistry从而实现自动注册，所以真正实现自动注册的应该是ServiceRegistry中。

我们回到bind()方法也是就是我们的入口，它进行上下文的namespace判断之后，初始化我们启动的端口之后调用start()方法。

start()的处理逻辑，首先判断我们是否开启服务注册，否则直接跳过，然后依托serviceRegistry完成注册之后，发布注册之后的事件。

```java
public class NacosServiceRegistry implements ServiceRegistry<Registration> {
    ...
    private final NacosDiscoveryProperties nacosDiscoveryProperties;

	private final NamingService namingService;
    ...
    @Override
	public void register(Registration registration) {

		if (StringUtils.isEmpty(registration.getServiceId())) {
			log.warn("No service to register for nacos client...");
			return;
		}

		String serviceId = registration.getServiceId();

		Instance instance = new Instance();
		instance.setIp(registration.getHost());
		instance.setPort(registration.getPort());
		instance.setWeight(nacosDiscoveryProperties.getWeight());
		instance.setClusterName(nacosDiscoveryProperties.getClusterName());
		instance.setMetadata(registration.getMetadata());

		try {
			namingService.registerInstance(serviceId, instance);
			log.info("nacos registry, {} {}:{} register finished", serviceId,
					instance.getIp(), instance.getPort());
		}
		catch (Exception e) {
			log.error("nacos registry, {} register failed...{},", serviceId,
					registration.toString(), e);
		}
	}
}
```

注意到NacosServoceRegistry中有两个属性：

- nacosDiscoveryProperties：nacos自动发现相关属性
- namingService：用于客户端注册实例或者查询实例

```java
public class NacosNamingService implements NamingService {
    ...
    @Override
    public void registerInstance(String serviceName, Instance instance) throws NacosException {
        registerInstance(serviceName, Constants.DEFAULT_GROUP, instance);
    }
    ...
    @Override
    public void registerInstance(String serviceName, String groupName, Instance instance) throws NacosException {
        // nacos 1.0版本新增的ephemeral字段，它表示注册的实例是临时的还是持久的。
        // 如果是临时的，则不会再Nacos服务端持久化存储，需要用心跳的方式保活，如果一段事件没有上报心跳，则会被服务端摘除。
        // 持久化实例则会被Nacos服务端持久化，如果此时客户端已下线，这个实例也不会从客户端剔除，只会将健康状态设为不健康。
        // 上面说了两种模式的不同和处理上的区别，那么Nacos为什么设计两种模式，它们是为了应对什么样的场景而存在呢？
        // 对于临时实例，健康检查失败，则直接可以从列表中删除。这种特性就比较适合那些需要应对流量突增的场景，服务可以进行弹性扩容。当流量过去之后，服务停掉即可自动注销了。
        // 对于持久化实例，健康检查失败，会被标记成不健康状态。它的好处是运维可以实时看到实例的健康状态，便于后续的警告、扩容等一些列措施。
        // https://developer.aliyun.com/article/845113
        // 如果是临时节点，则需要利用心跳信息进行保活
        if (instance.isEphemeral()) {
            BeatInfo beatInfo = new BeatInfo();
            beatInfo.setServiceName(NamingUtils.getGroupedName(serviceName, groupName));
            beatInfo.setIp(instance.getIp());
            beatInfo.setPort(instance.getPort());
            beatInfo.setCluster(instance.getClusterName());
            beatInfo.setWeight(instance.getWeight());
            beatInfo.setMetadata(instance.getMetadata());
            beatInfo.setScheduled(false);
            long instanceInterval = instance.getInstanceHeartBeatInterval();
            beatInfo.setPeriod(instanceInterval == 0 ? DEFAULT_HEART_BEAT_INTERVAL : instanceInterval);
		   // 定时发送心跳
            beatReactor.addBeatInfo(NamingUtils.getGroupedName(serviceName, groupName), beatInfo);
        }
	    // 服务zhu'ce
        serverProxy.registerService(NamingUtils.getGroupedName(serviceName, groupName), groupName, instance);
    }
}
```

## 服务端

```java
// 实例相关的操作
@RestController
@RequestMapping(UtilsAndCommons.NACOS_NAMING_CONTEXT + UtilsAndCommons.NACOS_NAMING_INSTANCE_CONTEXT)
public class InstanceController {
    // 注册实例
    @CanDistro
    @PostMapping
    @Secured(action = ActionTypes.WRITE)
    public String register(HttpServletRequest request) throws Exception {
        
        final String namespaceId = WebUtils
                .optional(request, CommonParams.NAMESPACE_ID, Constants.DEFAULT_NAMESPACE_ID);
        final String serviceName = WebUtils.required(request, CommonParams.SERVICE_NAME);
        NamingUtils.checkServiceNameFormat(serviceName);
        // 构建实例
        final Instance instance = HttpRequestInstanceBuilder.newBuilder()
                .setDefaultInstanceEphemeral(switchDomain.isDefaultInstanceEphemeral()).setRequest(request).build();
        // 分别对应着两个版本，v1和v2（实现了通过grpc进行通讯）版本，通过配置选取对应的实现进行注册实例
        getInstanceOperator().registerInstance(namespaceId, serviceName, instance);
        return "ok";
    }
}
```

v1版本的实现：

```java
@Component
public class InstanceOperatorServiceImpl implements InstanceOperator {
        @Override
    public void registerInstance(String namespaceId, String serviceName, Instance instance) throws NacosException {
        // 从v2版本的实例转换到v1版本
        com.alibaba.nacos.naming.core.Instance coreInstance = parseInstance(instance);
        // 注册实例
        serviceManager.registerInstance(namespaceId, serviceName, coreInstance);
    }
}
```

```java
@Component
public class ServiceManager implements RecordListener<Service> {
    // 实例的缓存信息 结构：Map(namespace, Map(group::serviceName, Service)).
    private final Map<String, Map<String, Service>> serviceMap = new ConcurrentHashMap<>();
    
    // 注册实例
    public void registerInstance(String namespaceId, String serviceName, Instance instance) throws NacosException {
        // 如果实例不存在，则初始化服务对象并把它放入缓存中
        createEmptyService(namespaceId, serviceName, instance.isEphemeral());
        
        Service service = getService(namespaceId, serviceName);
        
        checkServiceIsNull(service, namespaceId, serviceName);
        
        addInstance(namespaceId, serviceName, instance.isEphemeral(), instance);
    }
    
    public void createEmptyService(String namespaceId, String serviceName, boolean local) throws NacosException {
        createServiceIfAbsent(namespaceId, serviceName, local, null);
    }
    
    public void createServiceIfAbsent(String namespaceId, String serviceName, boolean local, Cluster cluster)
            throws NacosException {
        Service service = getService(namespaceId, serviceName);
        // 该服务未被初始化
        if (service == null) {
            
            Loggers.SRV_LOG.info("creating empty service {}:{}", namespaceId, serviceName);
            service = new Service();
            service.setName(serviceName);
            service.setNamespaceId(namespaceId);
            service.setGroupName(NamingUtils.getGroupName(serviceName));
            // now validate the service. if failed, exception will be thrown
            service.setLastModifiedMillis(System.currentTimeMillis());
            service.recalculateChecksum();
            if (cluster != null) {
                cluster.setService(service);
                service.getClusterMap().put(cluster.getName(), cluster);
            }
            service.validate();
            // 1、将实例放置缓存中
            // 2、启动检查该服务下实例心跳的线程
            // 3、给该服务新增监听器
            putServiceAndInit(service);
            // 如果该实例不是临时实例，则需要新增服务信息到Nacos集群中
            if (!local) {
                addOrReplaceService(service);
            }
        }
    }
    
    public Service getService(String namespaceId, String serviceName) {
        Map<String, Service> service = this.serviceMap.get(namespaceId);
        if (service == null) {
            return null;
        }
        return service.get(serviceName);
    }
}
```

## 服务实例的监听机制

对于Nacos的服务的实例都有对应的监听机制，当服务的实例发生变化时，例如：新增、删除实例，都触发对应的动作。

### 监听机制注册

当服务注册时，有如下代码：

```java
        consistencyService
                .listen(KeyBuilder.buildInstanceListKey(service.getNamespaceId(), service.getName(), true), service);
        consistencyService
                .listen(KeyBuilder.buildInstanceListKey(service.getNamespaceId(), service.getName(), false), service);
```

此代码分别给服务注册了临时和持久服务对应的监听机制。

### 监听机制的触发

以Distro协议为例，具体的逻辑在`com.alibaba.nacos.naming.consistency.ephemeral.distro.DistroConsistencyServiceImpl`中

```java
@DependsOn("ProtocolManager")
@org.springframework.stereotype.Service("distroConsistencyService")
public class DistroConsistencyServiceImpl implements EphemeralConsistencyService, DistroDataProcessor {
    ...
    private volatile Notifier notifier = new Notifier();
    ...
    @PostConstruct
    public void init() {
        GlobalExecutor.submitDistroNotifyTask(notifier);
    }
    ...
}
```

通过`@PostConstruct`触发通知任务。

### 服务实例变化之后的处理

上述说到，当服务实例发生变化后，分别触发`com.alibaba.nacos.naming.core.Service#onChange`和`com.alibaba.nacos.naming.core.Service#onDelete`方法，这里讲解他们具体做了什么处理。

```java
@JsonInclude(Include.NON_NULL)
public class Service extends com.alibaba.nacos.api.naming.pojo.Service implements Record, RecordListener<Instances> {
	@Override
    public void onChange(String key, Instances value) throws Exception {
        
        Loggers.SRV_LOG.info("[NACOS-RAFT] datum is changed, key: {}, value: {}", key, value);
        
        for (Instance instance : value.getInstanceList()) {
			// 校验实例不能为空            
            if (instance == null) {
                // Reject this abnormal instance list:
                throw new RuntimeException("got null instance " + key);
            }
			// 权重的取值范围0.01<权重<10000
            if (instance.getWeight() > 10000.0D) {
                instance.setWeight(10000.0D);
            }
            
            if (instance.getWeight() < 0.01D && instance.getWeight() > 0.0D) {
                instance.setWeight(0.01D);
            }
        }
        // 更新实例信息
        updateIPs(value.getInstanceList(), KeyBuilder.matchEphemeralInstanceListKey(key));
        // 重新计算checksum
        recalculateChecksum();
    }
    
    @Override
    public void onDelete(String key) throws Exception {
        boolean isEphemeral = KeyBuilder.matchEphemeralInstanceListKey(key);
        for (Cluster each : clusterMap.values()) {
            each.updateIps(Collections.emptyList(), isEphemeral);
        }
    }
    
    public void updateIPs(Collection<Instance> instances, boolean ephemeral) {
        // 初始化Map<clusterName, List<Instance>>
        Map<String, List<Instance>> ipMap = new HashMap<>(clusterMap.size());
        for (String clusterName : clusterMap.keySet()) {
            ipMap.put(clusterName, new ArrayList<>());
        }
        // 遍历所有实例，将实例加入ipMap中
        for (Instance instance : instances) {
            try {
                if (instance == null) {
                    Loggers.SRV_LOG.error("[NACOS-DOM] received malformed ip: null");
                    continue;
                }
                
                // 如果集群名称为空设置默认集群名称
                if (StringUtils.isEmpty(instance.getClusterName())) {
                    instance.setClusterName(UtilsAndCommons.DEFAULT_CLUSTER_NAME);
                }
                
                // 如果现有集群名称中不包含此集群名称则需要新建
                if (!clusterMap.containsKey(instance.getClusterName())) {
                    Loggers.SRV_LOG.warn(
                            "cluster: {} not found, ip: {}, will create new cluster with default configuration.",
                            instance.getClusterName(), instance.toJson());
                    Cluster cluster = new Cluster(instance.getClusterName(), this);
                    cluster.init();
                    getClusterMap().put(instance.getClusterName(), cluster);
                }
                
                ipMap.putIfAbsent(instance.getClusterName(), new LinkedList<>());
    
                ipMap.get(instance.getClusterName()).add(instance);
            } catch (Exception e) {
                Loggers.SRV_LOG.error("[NACOS-DOM] failed to process ip: " + instance, e);
            }
        }
        
        for (Map.Entry<String, List<Instance>> entry : ipMap.entrySet()) {
            //make every ip mine
            List<Instance> entryIPs = entry.getValue();
            // 更新Cluster
            clusterMap.get(entry.getKey()).updateIps(entryIPs, ephemeral);
        }
        // 修改最近更新时间
        setLastModifiedMillis(System.currentTimeMillis());
        // 发布服务改变时间
        getPushService().serviceChanged(this);
        // 执行双写服务
        ApplicationUtils.getBean(DoubleWriteEventListener.class).doubleWriteToV2(this, ephemeral);
        StringBuilder stringBuilder = new StringBuilder();
        
        for (Instance instance : allIPs()) {
            stringBuilder.append(instance.toIpAddr()).append('_').append(instance.isHealthy()).append(',');
        }
        
        // 打野所有实例
        Loggers.EVT_LOG.info("[IP-UPDATED] namespace: {}, service: {}, ips: {}", getNamespaceId(), getName(),
                stringBuilder.toString());
        
    }
}
```

## 心跳机制

Nacos的心跳机制和临时实例和持久实例的特性息息相关，所以我这里通过临时实例和持久化实例作为维度进行分析。

- 临时实例：临时实例只是临时注册在注册中心上，当服务下线或服务不可用时会被注册中心剔除，临时实例会与注册中心保持心跳，当服务端在指定时间没有接收到客户端的心跳信息，则会把实例状态置为不健康，然后在一段时间之后将它从注册中心剔除。
- 持久实例：永久实例会永久注册在注册中心，除非对它进行删除操作才能将它剔除，并且对于永久实例它可能并不知道注册中心的存在，不会向注册中心上报心跳，而是注册中心主动对他进行探活。

### 临时实例客户端心跳机制

在客户端启动时，在发起服务注册的逻辑中，有如下代码:

```java
public class NacosNamingService implements NamingService {
    public void registerInstance(String serviceName, String groupName, Instance instance) throws NacosException {
        String groupedServiceName = NamingUtils.getGroupedName(serviceName, groupName);
        // 是否临时实例，临时实例则需要客户端主动推送心跳，而持久实例则通过服务端主动探测
        if (instance.isEphemeral()) {
            BeatInfo beatInfo = this.beatReactor.buildBeatInfo(groupedServiceName, instance);
            this.beatReactor.addBeatInfo(groupedServiceName, beatInfo);
        }
        this.serverProxy.registerService(groupedServiceName, groupName, instance);
    }
}
```

在上述代码中，如果注册的时临时实例，则客户端开启线程主动给注册中心上报心跳信息。

```java
public void addBeatInfo(String serviceName, BeatInfo beatInfo) {
        LogUtils.NAMING_LOGGER.info("[BEAT] adding beat: {} to beat map.", beatInfo);
    	// 通过服务名称、ip、port构建唯一key
        String key = this.buildKey(serviceName, beatInfo.getIp(), beatInfo.getPort());
    	// 如果已经注册该实例则先停止已经存在的实例
        BeatInfo existBeat = null;
        if ((existBeat = (BeatInfo)this.dom2Beat.remove(key)) != null) {
            existBeat.setStopped(true);
        }

        this.dom2Beat.put(key, beatInfo);
    	// 心跳线程开始调度
        this.executorService.schedule(new BeatReactor.BeatTask(beatInfo), beatInfo.getPeriod(), TimeUnit.MILLISECONDS);
    	// 设置metrics
        MetricsMonitor.getDom2BeatSizeMonitor().set((double)this.dom2Beat.size());
    }
```

心跳任务代码如下：

```java
class BeatTask implements Runnable {
        BeatInfo beatInfo;

        public BeatTask(BeatInfo beatInfo) {
            this.beatInfo = beatInfo;
        }

        public void run() {
            // 如果停止则直接结束，并且不开始下一次的调度
            if (!this.beatInfo.isStopped()) {
                // 获取心跳间隔
                long nextTime = this.beatInfo.getPeriod();

                try {
                    JsonNode result = BeatReactor.this.serverProxy.sendBeat(this.beatInfo, BeatReactor.this.lightBeatEnabled);
                    long interval = result.get("clientBeatInterval").asLong();
                    boolean lightBeatEnabled = false;
                    if (result.has("lightBeatEnabled")) {
                        lightBeatEnabled = result.get("lightBeatEnabled").asBoolean();
                    }
				  // 标记心跳已经开启
                    BeatReactor.this.lightBeatEnabled = lightBeatEnabled;
                    // 如果服务端返回的间隔时间不为空，则以服务端返回的为准
                    if (interval > 0L) {
                        nextTime = interval;
                    }

                    int code = 10200;
                    if (result.has("code")) {
                        code = result.get("code").asInt();
                    }
				  // 如果返回值==20404代表资源没找到，则开始新的一轮注册
                    if (code == 20404) {
                        Instance instance = new Instance();
                        instance.setPort(this.beatInfo.getPort());
                        instance.setIp(this.beatInfo.getIp());
                        instance.setWeight(this.beatInfo.getWeight());
                        instance.setMetadata(this.beatInfo.getMetadata());
                        instance.setClusterName(this.beatInfo.getCluster());
                        instance.setServiceName(this.beatInfo.getServiceName());
                        instance.setInstanceId(instance.getInstanceId());
                        instance.setEphemeral(true);

                        try {
                            BeatReactor.this.serverProxy.registerService(this.beatInfo.getServiceName(), NamingUtils.getGroupName(this.beatInfo.getServiceName()), instance);
                        } catch (Exception var10) {
                        }
                    }
                } catch (NacosException var11) {
                    LogUtils.NAMING_LOGGER.error("[CLIENT-BEAT] failed to send beat: {}, code: {}, msg: {}", new Object[]{JacksonUtils.toJson(this.beatInfo), var11.getErrCode(), var11.getErrMsg()});
                }
			   // 开始下一次的心跳发起
                BeatReactor.this.executorService.schedule(BeatReactor.this.new BeatTask(this.beatInfo), nextTime, TimeUnit.MILLISECONDS);
            }
        }
    }
```

### 临时实例服务端心跳机制

```java
@RestController
@RequestMapping(UtilsAndCommons.NACOS_NAMING_CONTEXT + UtilsAndCommons.NACOS_NAMING_INSTANCE_CONTEXT)
public class InstanceController {
    @CanDistro
    @PutMapping("/beat")
    @Secured(action = ActionTypes.WRITE)
    public ObjectNode beat(HttpServletRequest request) throws Exception {
        ...
        int resultCode = getInstanceOperator()
                .handleBeat(namespaceId, serviceName, ip, port, clusterName, clientBeat, builder);
        ...
        return result;
    }
}
```

chuli

```java
@Override
    public int handleBeat(String namespaceId, String serviceName, String ip, int port, String cluster,
            RsInfo clientBeat, BeatInfoInstanceBuilder builder) throws NacosException {
        // 转换实体
        com.alibaba.nacos.naming.core.Instance instance = serviceManager
                .getInstance(namespaceId, serviceName, cluster, ip, port);
        
        if (instance == null) {
            // 如果实例为空并且客户端发送的心跳也为空，则返回RESOURCE_NOT_FOUND
            if (clientBeat == null) {
                return NamingResponseCode.RESOURCE_NOT_FOUND;
            }
            // 如果客户端的心跳不为空，则重新注册
            Loggers.SRV_LOG.warn("[CLIENT-BEAT] The instance has been removed for health mechanism, "
                    + "perform data compensation operations, beat: {}, serviceName: {}", clientBeat, serviceName);
            instance = parseInstance(builder.setBeatInfo(clientBeat).setServiceName(serviceName).build());
            serviceManager.registerInstance(namespaceId, serviceName, instance);
        }
        
        Service service = serviceManager.getService(namespaceId, serviceName);
        
        serviceManager.checkServiceIsNull(service, namespaceId, serviceName);
        // 如果客户端的心跳为空，则创建心跳
        if (clientBeat == null) {
            clientBeat = new RsInfo();
            clientBeat.setIp(ip);
            clientBeat.setPort(port);
            clientBeat.setCluster(cluster);
        }
        // 对心跳进行处理
        service.processClientBeat(clientBeat);
        return NamingResponseCode.OK;
    }
```

处理逻辑

```java
public class ClientBeatProcessor implements BeatProcessor {
    @Override
    public void run() {
        Service service = this.service;
        if (Loggers.EVT_LOG.isDebugEnabled()) {
            Loggers.EVT_LOG.debug("[CLIENT-BEAT] processing beat: {}", rsInfo.toString());
        }
        
        String ip = rsInfo.getIp();
        String clusterName = rsInfo.getCluster();
        int port = rsInfo.getPort();
        // 通过集群名称获取此集群
        Cluster cluster = service.getClusterMap().get(clusterName);
        List<Instance> instances = cluster.allIPs(true);
		// 对集群中所有实例进行处理
        for (Instance instance : instances) {
            if (instance.getIp().equals(ip) && instance.getPort() == port) {
                if (Loggers.EVT_LOG.isDebugEnabled()) {
                    Loggers.EVT_LOG.debug("[CLIENT-BEAT] refresh beat: {}", rsInfo.toString());
                }
                // 更新实例最后心跳时间
                instance.setLastBeat(System.currentTimeMillis());
                // 如果实例没有被标记，并且目前处于不健康状态，则更新实例的健康状态，并且发布实例状态改变事件
                if (!instance.isMarked() && !instance.isHealthy()) {
                    instance.setHealthy(true);
                    Loggers.EVT_LOG
                            .info("service: {} {POS} {IP-ENABLED} valid: {}:{}@{}, region: {}, msg: client beat ok",
                                    cluster.getService().getName(), ip, port, cluster.getName(),
                                    UtilsAndCommons.LOCALHOST_SITE);
                    // 对订阅此服务的客户端发送udp事件通知
                    getPushService().serviceChanged(service);
                }
            }
        }
    }
}
```

## 持久化实例的检查机制

持久化实例的检查机制是服务成功注册之后，然后通过定时任务类似的机制，由服务端主动向客户端发起探测。

```java
public class Cluster extends com.alibaba.nacos.api.naming.pojo.Cluster implements Cloneable {
    // 集群的初始化方法，开启健康检查任务
    public void init() {
        if (inited) {
            return;
        }
        checkTask = new HealthCheckTask(this);
        
        HealthCheckReactor.scheduleCheck(checkTask);
        inited = true;
    }
}
```

健康检查的核心逻辑

```java
public class HealthCheckTask implements Runnable {
        @Override
    public void run() {
        
        try {
            // 如果使用了2.0+grpc的功能，则不进入
            // If upgrade to 2.0.X stop health check with v1
            if (ApplicationUtils.getBean(UpgradeJudgement.class).isUseGrpcFeatures()) {
                return;
            }
            if (distroMapper.responsible(cluster.getService().getName()) && switchDomain
                    .isHealthCheckEnabled(cluster.getService().getName())) {
                healthCheckProcessor.process(this);
                if (Loggers.EVT_LOG.isDebugEnabled()) {
                    Loggers.EVT_LOG
                            .debug("[HEALTH-CHECK] schedule health check task: {}", cluster.getService().getName());
                }
            }
        } catch (Throwable e) {
            Loggers.SRV_LOG
                    .error("[HEALTH-CHECK] error while process health check for {}:{}", cluster.getService().getName(),
                            cluster.getName(), e);
        } finally {
            if (!cancelled) {
                HealthCheckReactor.scheduleCheck(this);
                
                // worst == 0 means never checked
                if (this.getCheckRtWorst() > 0 && switchDomain.isHealthCheckEnabled(cluster.getService().getName())
                        && distroMapper.responsible(cluster.getService().getName())) {
                    // TLog doesn't support float so we must convert it into long
                    long diff =
                            ((this.getCheckRtLast() - this.getCheckRtLastLast()) * 10000) / this.getCheckRtLastLast();
                    
                    this.setCheckRtLastLast(this.getCheckRtLast());
                    
                    Cluster cluster = this.getCluster();
                    
                    if (Loggers.CHECK_RT.isDebugEnabled()) {
                        Loggers.CHECK_RT.debug("{}:{}@{}->normalized: {}, worst: {}, best: {}, last: {}, diff: {}",
                                cluster.getService().getName(), cluster.getName(), cluster.getHealthChecker().getType(),
                                this.getCheckRtNormalized(), this.getCheckRtWorst(), this.getCheckRtBest(),
                                this.getCheckRtLast(), diff);
                    }
                }
            }
        }
    }
}
```

## V2的健康检查机制

#### 健康检查的拦截链机制

Nacos服务端在处理健康检查和心跳机制的时候是采用拦截链来执行的，拦截链内部有多个拦截器，通过获取不同的拦截器链实例，在实例内部指定具体的拦截器类型来组成一组拦截器。这里使用了拦截器模式和模板模式来组织代码。拦截器模式体现在整体拦截机制的实现，模板模式主要体现在对拦截器链的抽象实现上。

**拦截链的核心类图**

![image-20220817220500150](https://raw.githubusercontent.com/stone-98/picture-bed/main/imgimage-20220817220500150.png)

**核心类：**

- Interceptable：定义了该拦截链处理的对象基类

  - void passIntercept()：该对象没有被拦截器拦截，则执行该方法中具体的业务逻辑
  - void afterIntercept()：该对象在被拦截链拦截之后，则执行该方法中具体的业务逻辑

- NacosNamingInterceptor：定义一个拦截器的基本功能，同时限定了传入的拦截对象类型必须为Interceptable以及Interceptable的子类

  - boolean isInterceptType(Class<?> type)：判断拦截器是否支持处理这个类型
  - boolean intercept(T object)：判断是否执行拦截操作
  - int order()：拦截器的优先级，数字越低优先级越高

- NacosNamingInterceptorChain：定义了拦截器链对象应该具有的基本行为

  - void addInterceptor(NacosNamingInterceptor<T> interceptor)：添加拦截器
  - void doInterceptor(T object)：执行拦截器

- AbstractNamingInterceptorChain：抽象的拦截链，定义了拦截链的基本工作流程

  - public void addInterceptor(NacosNamingInterceptor<T> interceptor)：向interceptors属性中新增拦截器

  - public void doInterceptor(T object)：通过interceptors对传入的Interceptable的子类执行拦截操作，拦截成功后调用com.alibaba.nacos.naming.interceptor.Interceptable#afterIntercept，否则调用com.alibaba.nacos.naming.interceptor.Interceptable#passIntercept

AbstractNamingInterceptorChain具体的源码解析如下所示：

```java
public abstract class AbstractNamingInterceptorChain<T extends Interceptable>
        implements NacosNamingInterceptorChain<T> {
    
    // 存储多个拦截器
    private final List<NacosNamingInterceptor<T>> interceptors;
    
    // protected限制只有当前包和子类才能够对它进行初始化
    protected AbstractNamingInterceptorChain(Class<? extends NacosNamingInterceptor<T>> clazz) {
        // 初始化拦截链
        this.interceptors = new LinkedList<>();
        // 使用SPI模式加载指定的拦截器类型
        interceptors.addAll(NacosServiceLoader.load(clazz));
        // 对拦截器的顺序进行排序
        interceptors.sort(Comparator.comparingInt(NacosNamingInterceptor::order));
    }
    
    /**
     * Get all interceptors.
     * 获取全部的拦截器
     *
     * @return interceptors list
     */
    protected List<NacosNamingInterceptor<T>> getInterceptors() {
        return interceptors;
    }
    
    /**
     * 新增拦截器
     * @param interceptor interceptor
     */
    @Override
    public void addInterceptor(NacosNamingInterceptor<T> interceptor) {
        interceptors.add(interceptor);
        interceptors.sort(Comparator.comparingInt(NacosNamingInterceptor::order));
    }
    
    /**
     * 执行拦截器
     * @param object be interceptor object
     */
    @Override
    public void doInterceptor(T object) {
        // 因为内部的拦截器已经排序过了，所以直接遍历
        for (NacosNamingInterceptor<T> each : interceptors) {
            // 若当前拦截的对象不是当前拦截器所要处理的类型则调过
            if (!each.isInterceptType(object.getClass())) {
                continue;
            }
            // 执行拦截操作成功之后，继续执行拦截后操作
            if (each.intercept(object)) {
                object.afterIntercept();
                return;
            }
        }
        // 未拦截的操作
        object.passIntercept();
    }
}
```

至此总结下拦截链的工作逻辑：

​	AbstractNamingInterceptorChain可以通过SPI机制或手动的方式添加具体的拦截器，然后调用AbstractNamingInterceptorChain.doInterceptor()方法并且传入Interceptable，拦截链则对传入Interceptable执行拦截。

- 当拦截成功则调用com.alibaba.nacos.naming.interceptor.Interceptable#afterIntercept
- 当未被拦截则调用com.alibaba.nacos.naming.interceptor.Interceptable#passIntercept

具体的业务逻辑则在afterIntercept和passIntercept方法中。

# 附录

## 1、集群名称

在Nacos中，支持集群配置，集群是对指定微服务的一种虚拟分类，从而实现异地多活，就近调用。

在配置信息中指定集群名称，如下：

```yaml
spring:
  cloud:
    nacos:
      discovery:
        # 北京机房集群，如不进行指定，则使用默认集群名称
        cluster-name: BJ
```

## 2、标记服务下线





