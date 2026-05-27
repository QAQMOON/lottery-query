# 彩票查询代码

微信原生小程序 + 云开发版本，用于展示超级大乐透最近一期、历史开奖、同日快捷查询和开奖详情。

## 功能

- 最近一期开奖结果查询
- 首次访问时自动补拉最近一期，避免空库首屏无数据
- 历史开奖按期号、年份、日期查询
- 上月同日、上六个月同日、上一年同日查询
- 目标日期无开奖时返回相邻前后期开奖
- 开奖日定时同步最新结果
- 数据说明和审核说明页面

## 技术方案

- 小程序：微信原生小程序
- 后端：微信云开发云函数
- 数据库：微信云数据库
- 数据源：Huiniao 免费开奖接口，彩种 `dlt`
- 可选增强：APIHZ 接口用于补充奖池、销售额、奖级明细
- 官方说明：中国体育彩票开奖结果为最终依据

## 目录

```text
miniprogram/              小程序前端
cloudfunctions/lottery/   统一云函数
```

## 需要你填写

当前版本不需要付费 Juhe Key。

如需补充奖池、销售额、奖级明细，可选配置 APIHZ 免费账号：

```text
APIHZ_ID=你的接口盒子 ID
APIHZ_KEY=你的接口盒子 KEY
```

AppID 已写入 `project.config.json`：

```text
wxfeef5b2b429cc576
```

云开发环境 ID 已写入 `miniprogram/app.js`：

```text
cloud1-d5gvlaubhbbbfcdd2
```

## 云数据库集合

在云开发环境中创建：

```text
dlt_results
sync_logs
```

建议权限：前端不直接访问数据库，只通过云函数访问。数据库权限可保持默认或设置为仅云函数端可写。

## 云函数接口

统一函数名：`lottery`

支持 action：

```text
getLatest      获取最近一期
queryHistory   历史查询
getDetail      查询详情
getRelative    查询上月/上六个月/上一年同日
syncLatest     同步最新一期
syncHistory    分页初始化历史数据
```

## 同步策略

云函数触发器配置在：

```text
cloudfunctions/lottery/config.json
```

当前策略：

```text
每周一、三、六 21:25-21:50 每分钟执行一次
```

函数内部还会再次判断是否处于开奖窗口，避免误触发。

## 历史数据范围

本工具收录范围从：

```text
2015-01-03
```

目标日期早于该日期时返回“超出收录范围”。

## 本地打开

1. 打开微信开发者工具
2. 导入本目录
3. AppID 使用 `wxfeef5b2b429cc576`
4. 开通云开发并填写 `envId`
5. 上传并部署 `cloudfunctions/lottery`
6. 可选配置云函数环境变量 `APIHZ_ID`、`APIHZ_KEY`
7. 调用 `syncHistory` 初始化历史数据

详见 [DEPLOYMENT.md](./DEPLOYMENT.md)。
