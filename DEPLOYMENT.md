# 部署步骤

## 1. 导入项目

用微信开发者工具打开：

```text
C:\Users\111\projects\dlt-lottery-miniapp
```

确认 AppID（在微信公众平台获取）。

## 2. 开通云开发

在微信开发者工具中开通云开发，复制环境 ID。

请在云开发控制台获取环境 ID 并配置。

对应文件：

```text
miniprogram/app.js
```

如果后面更换环境，再修改该文件里的 `globalData.envId`。

## 3. 创建数据库集合

在云开发控制台创建：

```text
dlt_results
sync_logs
```

## 4. 配置可选增强接口

当前主数据源使用 Huiniao 免费接口，不需要 Juhe Key。

如果你申请了 APIHZ 免费账号，可在云函数 `lottery` 的环境变量中增加：

```text
APIHZ_ID=你的接口盒子 ID
APIHZ_KEY=你的接口盒子 KEY
```

APIHZ 用于补充销售额、奖池和奖级明细。未配置时，小程序仍可查询期号、日期和开奖号码。

如免费接口地址变更，可临时覆盖：

```text
HUINIAO_HISTORY_URL=https://api.huiniao.top/interface/home/lotteryHistory
APIHZ_DLT_URL=https://cn.apihz.cn/api/caipiao/daletou.php
```

不要把任何接口密钥写进前端代码，也不要提交到 GitHub。

## 5. 部署云函数

在微信开发者工具中右键：

```text
cloudfunctions/lottery
```

选择：

```text
上传并部署：云端安装依赖
```

## 6. 初始化历史数据

云函数 `syncHistory` 支持分页初始化。建议每次只跑少量页，避免一次执行超时。

测试参数：

```json
{
  "action": "syncHistory",
  "page": 1,
  "pageSize": 50,
  "maxPages": 5
}
```

返回 `nextPage` 后继续执行下一批，直到 `stopped` 为 `true`。

## 7. 同步最新一期

测试参数：

```json
{
  "action": "syncLatest"
}
```

成功后首页应能看到最近一期。

说明：如果数据库为空，首页调用 `getLatest` 时也会自动补拉并保存最近一期。`syncLatest` 仍可用于部署后手动验证和开奖日触发器同步。

## 8. 定时触发器

触发器配置在：

```text
cloudfunctions/lottery/config.json
```

当前配置：

```json
{
  "triggers": [
    {
      "name": "sync-dlt-draw-window",
      "type": "timer",
      "config": "0 25-50 21 * * MON,WED,SAT *"
    }
  ]
}
```

如果微信开发者工具提示 Cron 格式不兼容，先按控制台提示调整星期字段。不同云函数控制台对星期数字含义可能不同，优先使用 `MON,WED,SAT` 这种无歧义写法；若必须使用数字，请以当前控制台说明为准。

```text
0 25-50 21 * * MON,WED,SAT *
```

## 9. 发布前检查

- 首页能加载最近一期
- 历史查询能按年份、日期、期号查询
- 同日查询能显示无开奖和相邻期
- 说明页明确无销售、无预测、无投注交易
- 服务类目和审核材料已准备
