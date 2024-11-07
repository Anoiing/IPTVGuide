<div align="center">
  <h1 align="center">IPTV电视直播源更新工具</h1>
</div>

<div align="center">一个自用的爬虫工具而已，用于获取网络上特定省份的一些酒店的组播 IPTV 地址。自用分享，理性使用。不要进行高频次任务，别人建站不易</div>
<div align="center">按省份地区或者地级市搜索当地的组播源，一般都包括CCTV、各省卫视和一些当地的地方台。</div>


## 特点

- Emby可播放
- 功能简单，你想要的功能都没有，只满足了我自己🤣
- 容易崩，重启就好，我自己能用就行😆
- 源失效快，我自己能用就行🙃
- 镜像更新慢，想到加什么再加，随缘😇

## 使用

### 拉取镜像
```bash
docker pull anoiv/iptvguide:latest
```
### 运行容器

```bash
docker run -d \
  -p 5174:5174 \
  --name=iptvguide \
  --restart=always \
  -v <your folder>:/app/config \
  -v <your folder>:/app/output \
  -e TZ="Asia/Shanghai" \
  anoiv/iptvguide:latest
```

## 其他

1、Github上太多做的比我好的大佬了，但是大部分源在Emby里都没法正常播放，这不是Emby的问题，是源限制了。所以我自己弄一个工具，给我的Emby用，这是我写这个项目的初衷

2、服务容易崩，崩了重启就好

3、遇到获取到的组播地址的大部分或者所有频道都不能播放，加到黑名单里重新跑一次任务就好

4、这种ipv4的组播源一般失效的都比较快，失效了就重新跑任务换一个就好

5、拿工具去爬别人的网站的，所以你的运行频率请控制好，别恶意高频跑任务整别人网站，我们这些白嫖的要有点道德

## 鸣谢

我的NAS小伙伴们，帕克、森度、老李、奥特曼、囚徒、句号哥和包含在省略号里的你们......
