# zashboard

<p align="center">
  <img src="./readme/pc.png" height="300">
  <img src="./readme/mobile.png" height="300">
</p>

## **Requirement**

Browser support

- Chrome 111 (released March 2023)
- Firefox 128 (released July 2024)
- Safari 16.4 (released March 2023)
- Not supported on iOS 16.4 jailbroken version.

## **Online**

You can access the online zashboard at the following link:

- [Online zashboard](http://board.zash.run.place)

## **Download**

You can download the zashboard files here:

> All builds include sing-box native API support.

The release has one deterministic MiSans bundle. Alternate CDN, system-font,
and per-font artifacts are not published.

The 5gpn fork publishes only from a strict
`vX.Y.Z-monolith.N` tag whose commit is reachable from
`feat/5gpn-console`; branch/manual dispatch cannot create a release. Repository
administration must prevent release-tag updates and deletion and keep immutable
releases enabled. The inherited upstream deployment workflow is hard-gated to
`Zephyruso/zashboard`, so this fork cannot publish the upstream CNAME or image
namespace.

- [5gpn monolith releases](https://github.com/moooyo/zashboard/releases)
- [upstream dist.zip](https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip)
- [upstream gh-pages.zip](https://github.com/Zephyruso/zashboard/archive/refs/heads/gh-pages.zip)

## **Docker Setup**

To run zashboard via Docker, use the following command:

```
docker run -d -p 80:80 ghcr.io/zephyruso/zashboard:latest
```

## Tips

1. The connection table can be dragged with the left mouse button, and right-clicking can copy cell content.
2. Right-clicking on a node / node group card will perform a speedtest for the node / node group.
3. The proxy group sorting is based on the node order in the GLOBAL group. In Mihomo, it follows the configuration file order, while in sing-box, route.final is placed first, with the rest following the configuration file order. If you need custom ordering, you can specify the order by overriding the GLOBAL group.
4. The dashboard remains installable as a PWA, but the 5gpn build is network-only and does not cache the control plane or fonts for offline use.
5. Core and dashboard self-upgrades are disabled. Install a digest-pinned 5gpn release to update either component without replacing the maintained forks.

## 提示

1. 连接表格可被鼠标左键拖动，右键可复制单元格内容。
2. 右键点击节点/节点组卡片可对节点/节点组进行测速。
3. 面板的节点组排序是根据GLOBAL组中的节点顺序排序的，在Mihomo中会是按配置文件的顺序，在sing-box中会把route.final放到第一位，其余按照配置文件顺序，如果你需要自定义顺序，可通过覆盖GLOBAL组指定顺序
4. 面板支持PWA（Progressive Web App），可以在移动设备上通过"添加到主屏幕"获得类原生app的体验

## One-time setup link

Zashboard accepts controller credentials only from the `/setup` hash-route fragment:

```text
https://console.example.com/ui/#/setup?type=clash&hostname=console.example.com&port=443&https=1&secret=URL_ENCODED_CONTROLLER_SECRET&label=5gpn&disableTunMode=1
```

The values must be encoded with `URLSearchParams` or an equivalent URL encoder. The required
fields are `type=clash`, `hostname`, `port`, `https=1`, and a non-empty `secret`. `label` and
`disableTunMode` are optional; the flag accepts `0` or `1`.
The page itself must be served over HTTPS, and `hostname` plus the effective `port` must match that
page's serving origin exactly. A setup link cannot send its Bearer secret to another origin.

This is a one-time handoff. Zashboard synchronously removes the complete fragment query with
`history.replaceState` before probing the controller. Invalid links and failed probes do not write
the backend or its secret to browser storage. After a successful probe, connection metadata is
stored in the normal backend list, while the controller secret is kept in `sessionStorage` for that
tab. The setup fragment never opts into persistent credential storage; the operator can do that
later with the explicit **Remember controller secret** control. The setup history entry is replaced,
so reloading or going back cannot consume the link again. The same rules apply when a link opens in
an existing tab or installed PWA: it is captured and scrubbed before vue-router handles the hash
navigation.

Credentials in the outer URL query (for example `/ui/?secret=...#/setup`) or on any route other
than `/setup` are rejected and scrubbed without being used. Never generate the deprecated outer
query form.

### I code just for fun, not for money. If you really want to donate, please consider donating to [UNICEF](https://www.unicef.org/) to help hungry children.
