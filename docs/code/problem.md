# 问题

## 通过`PID`找出对应的容器

首先通过`pwdx`查询`pid`的工作目录，如果返回`/`，则代表该进程由容器启动。

再通过

```sh
$ cat /proc/23325/cgroup
11:perf_event:/docker/3991c20d97ed61e63992f1b6b045885ce04d1fbe078d4d8d9cb8010a90bb8a07
10:memory:/docker/3991c20d97ed61e63992f1b6b045885ce04d1fbe078d4d8d9cb8010a90bb8a07
9:hugetlb:/docker/3991c20d97ed61e63992f1b6b045885ce04d1fbe078d4d8d9cb8010a90bb8a07
8:blkio:/docker/3991c20d97ed61e63992f1b6b045885ce04d1fbe078d4d8d9cb8010a90bb8a07
7:cpuset:/docker/3991c20d97ed61e63992f1b6b045885ce04d1fbe078d4d8d9cb8010a90bb8a07
6:net_prio,net_cls:/docker/3991c20d97ed61e63992f1b6b045885ce04d1fbe078d4d8d9cb8010a90bb8a07
5:freezer:/docker/3991c20d97ed61e63992f1b6b045885ce04d1fbe078d4d8d9cb8010a90bb8a07
4:devices:/docker/3991c20d97ed61e63992f1b6b045885ce04d1fbe078d4d8d9cb8010a90bb8a07
3:cpuacct,cpu:/docker/3991c20d97ed61e63992f1b6b045885ce04d1fbe078d4d8d9cb8010a90bb8a07
2:pids:/docker/3991c20d97ed61e63992f1b6b045885ce04d1fbe078d4d8d9cb8010a90bb8a07
1:name=systemd:/docker/3991c20d97ed61e63992f1b6b045885ce04d1fbe078d4d8d9cb8010a90bb8a07
```

取容器ID的前12位，再通过命令

```sh
$ docker ps | grep <containId>
```

就能找到对应的容器。

## 通过命令下载github上面的某一个文件

以部署ingress-nginx为例，deploy.yaml的链接为：

- https://github.com/kubernetes/ingress-nginx/blob/controller-v1.4.0/deploy/static/provider/cloud/deploy.yaml

我们将github.com替换成raw.githubusercontent.com并且去除blob：

- https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.4.0/deploy/static/provider/cloud/deploy.yaml

并且执行命令:

```sh
wget https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.4.0/deploy/static/provider/cloud/deploy.yaml
```

kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.4.0/deploy/static/provider/cloud/deploy.yaml

