### Kubernetes架构

api server：所有服务访问的统一入口

replication controller：管理副本的期望数量

scheduler：选择合适的节点进行任务分配

etcd：整个kubernetes的存储系统，一个分布式的键值存储服务

kubelet：kubelet和容器引擎进行交互，实现容器的生命周期管理

kube proxy：负责写入规则至iptables或ipvs实现服务映射访问（TODO不是十分理解！）

kubectl：命令行工具

### kubernetes重要组件

coredns:可以为集群中的svc创建一个域名ip的对应解析

dashboard：给k8s提供一个b/s结构的访问体系

ingress controller：官方的只能实现4层代理，ingress可以实现7层代理

fedetation：提供一个可以跨集群中心多k8s的统一管理的功能

prometheus：提供k8s的集群监控能力

elk：提供k8s集群日志统一分析接入平台

### pod的概念

- 自主性pod：不被k8s管理的pod
- 控制器管理的pod：

### 网络通讯方式

- k8s的网络模型假定了所有Pod都在一个可以直接连通的扁平网络空间中，这在GCE中是现成的网络模型，k8s假定这个网络已经存在，而在私有云中搭建k8s集群，需要自己实现这个网络假设，将不同节点上的Docker容器之间的互相访问先打通，然后运行k8s。

### 资源清单

名称空间级别

集群级别

元数据

### Pod的生命周期

### 安全认证

- HTTP Token认证机制
- HTTP Base认证机制
- HTTPS的双向认证

### 鉴权

#### RBAC

RBAC基于角色的访问控制，在kubernetes1.5版本引入，现已成为默认标准。它的优势如下：

- 覆盖集群中的资源和非资源属性
- 整个RBAC由几个对象完成，可以使用Kubectl和Api进行操作
- 可以在运行时调整



### Service

