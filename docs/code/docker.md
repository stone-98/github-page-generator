# Docker

TODO Docker整体架构图

TODO Docker整体交互图

## Dockerfile

### 描述

Dockerfile是Docker镜像的描述文件，Docker内部包含了一条条指令，每一条指令构建一层，因此每一层指令的内容，就是描述该层该如何构建。

### 命令

#### EXPOSE

该命令告诉容器监听连接的端口。

> 只有容器监听了端口，通过-P参数向外部暴漏的端口才真正生效!!!


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

## Docker Compose 安装

### 1、下载docker-compose

```bash
$ sudo curl -L "https://github.com/docker/compose/releases/download/v2.2.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
```

### 2、将docker-compose二进制文件赋予可执行权限

```bash
$ sudo chmod +x /usr/local/bin/docker-compose
```

### 3、创建软链：

```bash
$ sudo ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose
```

### 4、测试是否安装完成

```bash
$ docker-compose version
cker-compose version 1.24.1, build 4667896b
```

## Harbor安装教程

### 1、下载Harbor安装包进行解压

```bash
$ wget https://github.com/goharbor/harbor/releases/download/v2.6.1/harbor-offline-installer-v2.6.1.tgz
$ tar -zxvf harbor-offline-installer-v2.6.1.tgz
```

### 2、配置

先复制一份harbor.yml.tmpl文件命名为harbor.yml

```bash
# copy harbor文件
$ cp harbor.yml.tmpl harbor.yml
```

配置harbor.yml文件，注释掉https的配置内容，配置http相关的参数，主要是**hostname**（本机的IP地址），**port**（harbor后台管理页面暴漏的端口）。

配置文件相关改动如下：

```bash
# 本机IP设置为192.168.0.203
hostname: 192.168.0.203

# port改为8081
# http related config
http:
  # port for http, default is 80. If https enabled, this port will redirect to https port
  port: 8081
# 注释https相关内容
# https related config
# https:
  # https port for harbor, default is 443
  # port: 443
  # The path of cert and key files for nginx
  # certificate: /your/certificate/path
  # private_key: /your/private/key/path
```

注意：还有一些其他的配置，如果有需要的可以去了解一下。

例如Harbor Web端的访问地址，默认为Harbor12345，如果需要调整的话，可以自行修改相关的配置。

### 3、安装

```bash
$ ./prepare
$ ./install.sh
```

### 4、执行docker-compose.yml，启动harbor服务

```bash
$ docker-compose up -d
```

### 5、访问Harbor地址——192.168.0.203:8081

![image-20221025220705763](https://raw.githubusercontent.com/stone-98/picture-bed/main/imgimage-20221025220705763.png)

至此安装完成啦。
