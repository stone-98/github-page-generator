# Docker

## Docker安装

### 1、安装须知

安装Docker内核建议3.10版本以上。

查看Linux内核

```bash
[root@localhost ~]# uname -r
3.10.0-1160.el7.x86_64
```

### 2、更新yum包

```bash
[root@localhost ~]# yum -y update
```

### 3、卸载旧版本Docker(如果之前安装过)

```bash
[root@localhost ~]# yum remove docker  docker-common docker-selinux docker-engine
```

### 4、安装Docker详细步骤

#### 4.1、安装需要的软件包

- yum-util 提供yum-config-manager功能
- device-mapper-persistent-data、lvm2是**devicemapper**驱动的依赖

```bash
[root@localhost ~]# yum install -y yum-utils device-mapper-persistent-data lvm2
```

#### 4.2、设置yum源

- 中央仓库源
- 阿里仓库源

```bash
[root@localhost ~]# yum-config-manager --add-repo http://download.docker.com/linux/centos/docker-ce.repo

[root@localhost ~]# yum-config-manager --add-repo http://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
```

#### 4.3、查询docker版本并安装

- 查询docker版本

```bash
[root@localhost ~]# yum list docker-ce --showduplicates | sort -r
已加载插件：fastestmirror
可安装的软件包
 * updates: mirrors.ustc.edu.cn
Loading mirror speeds from cached hostfile
 * extras: mirrors.ustc.edu.cn
docker-ce.x86_64            3:20.10.9-3.el7                     docker-ce-stable
docker-ce.x86_64            3:20.10.8-3.el7                     docker-ce-stable
docker-ce.x86_64            3:20.10.7-3.el7                     docker-ce-stable
docker-ce.x86_64            3:20.10.6-3.el7                     docker-ce-stable
docker-ce.x86_64            3:20.10.5-3.el7                     docker-ce-stable
...
```

- 选择一个版本并安装：`yum install docker-ce-版本号`

```bash
[root@localhost ~]# yum -y install docker-ce-18.03.1.ce
```

#### 4.4、启动Docker并设置Docker 开机自启

```bash
[root@localhost ~]# systemctl start docker
[root@localhost ~]# systemctl enable docker
```

Docker安装完成~~~