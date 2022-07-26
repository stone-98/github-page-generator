# Nacos

## Nacos服务注册原理

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





