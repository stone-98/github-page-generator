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

#### 使用RBAC

在启动api-server时将`--authorization-mode`资源设置为一个逗号分隔的列表并确保其包含RBAC。

```sh
kube-apisever --authorization-mode=RBAC
```

#### API对象

RBAC中声明四种对象：Role、ClusterRole、RoleBinding、ClsterRoleBinding。

##### Role和ClusterRole

RBAC的Role和ClusterRol他们的权限是存粹累加的。

Role用来在某个命名空间中设置访问权限，在创建Pole时，你必须指定该Role所属的命名空间。

ClsterRole则是一个集群作用域的资源。ClusterRole可以用来:

- 定义对某命名空间域对象的访问权限，并将在个别命名空间内被赋予访问权限。
- 为命名空间作用域内的对象设置访问权限，并被授予跨所有命名空间的访问权限。
- 为集群作用域的资源定义访问权限

如果要在命名空间内定义角色，则应该使用Role，如果需要在集群范围定义角色， 则应该使用ClsterRole。

### 实践

Kubernetes集群有两类用户：由kubernetes管理的账号和普通账号。

*普通账号*：是由与Kubernetes无关的服务进行管理的，Kubernetes并不包含用来代表普通用户账号的对象，普通用户的信息无法通过API调用添加到集群中，但是Kubernetes仍然认为能够提供由集群的证书机构签名的合法证书的用户是通过身份认证的用户。

#### 创建一个用户只能管理dev空间

- 创建`devuser-csr.json`文件，内容如下：

```json
{
    "CN":"devuser",
    "hosts":[

    ],
    "key":{
        "algo":"rsa",
        "size":2048
    },
    "names":[
        {
            "C":"CN",
            "ST":"BeiJing",
            "L":"BeiJing",
            "O":"k8s",
            "OU":"System"
        }
    ]
}
```

- 下载证书生成工具，放`/user/local/bin`路径下

```sh
wget https://pkg.cfssl.org/R1.2/cfssl_linux-amd64
mv cfssl_linux-amd64 /usr/local/bin/cfssl
wget https://pkg.cfssl.org/R1.2/cfssljson_linux-amd64
mv cfssljson_linux-amd64 /usr/local/bin/cfssljson
wget https://pkg.cfssl.org/R1.2/cfssl-certinfo_linux-amd64
mv cfssl-certinfo_linux-amd64 /usr/local/bin/cfssl-certinfo
```

- 生成证书（在`/etc/kubernetes/pki`创建密钥信息，`/etcc/kubernetes/pki`中存储的都是密钥信息）

```sh
##            -ca指定私钥证书，-ca-key指定私钥 以及请求的文件 -bare指定输出的用户名
cfssl gencert -ca=ca.crt -ca-key=ca.key -profile=kubernetes /root/devuser-csr.json | cfssljson -bare devuser
```

成功生成` ca.crt`、`ca.key`、`devuser.csr`文件。（现在还不知道这些文件到底是干嘛的~~~~）

- 生成kubeconfig

```sh
## 设置kubernetes的api server地址
export KUBE_APISERVER="https://192.168.0.200:6443"

## 生成kubeconfig，并配置相关认证信息 (基本参数：证书、kubernetes apiserver、kubeconfig name)
kubectl config set-cluster kubernetes \
--certificate-authority=/etc/kubernetes/pki/ca.crt \
--embed-certs=true \
--server=${KUBE_APISERVER} \
--kubeconfig=devuser.kubeconfig

## 再配置相关认证信息
kubectl config set-credentials devuser \
> --client-certificate=/etc/kubernetes/pki/devuser.pem \
> --client-key=/etc/kubernetes/pki/devuser-key.pem \
> --embed-certs=true \
> --kubeconfig=devuser.kubeconfig

## 创建dev namespace（下面需要用到）
kubectl create namespace dev

## 配置kubernetes上下文
kubectl config set-context kubernetes \
--cluster=kubernetes \
--user=devuser \
--namespace=dev \
--kubeconfig=devuser.kubeconfig
```

至此我们成功生成了`devuser.kubeconfig`。

- kubernetes集群中创建对应`rolebingding`绑定`clusterrole`(admin是自带的)并且绑定`user`和`namespace`

```sh
kubectl create rolebinding devuser-admin-binding --clusterrole=admin --user=devuser --namespace=dev
```

- devuser账户进行请求时，带上`devuser.kubeconfig`

```sh
# 在devuser用户下创建.kube文件
mkdir /home/devuser/.kube
# 将devuser.kubeconfig拷贝到devuser用户的.kube路径下
cp devuser.kubeconfig /home/devuser/.kube/.kubeconfig
# 授权
chown devuser:devuser /home/devuser/.kube/.kubeconfig 
# 切换到devuser用户
su devuser
## 配置上下文，相当于告诉kubectl，当我请求kubernetes时，使用.kubeconfig的认证信息
kubectl config use-context kubernetes --kubeconfig=/home/devuser/.kube/.kubeconfig

```

- OK

### k8s部署dashboard



### Service

