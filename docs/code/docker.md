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





