# 部署步骤

## 1. 导入项目

用微信开发者工具打开本目录，填写你的 AppID。

## 2. 开通云开发

在微信开发者工具中开通云开发，复制环境 ID。

修改文件：

```text
miniprogram/app.js
```

将 `globalData.envId` 设置为你的环境 ID。

## 3. 创建数据库集合

在云开发控制台创建：

```text
dlt_results     大乐透开奖结果
ssq_results     双色球开奖结果
sync_logs       同步日志
```

## 4. 部署云函数

在微信开发者工具中右键：

```text
cloudfunctions/lottery
```

选择：

```text
上传并部署：云端安装依赖
```

## 5. 初始化历史数据

云函数 `syncHistory` 支持分页初始化。需要指定 `lotteryType` 参数。

大乐透初始化参数：

```json
{
  "action": "syncHistory",
  "lotteryType": "dlt",
  "page": 1,
  "pageSize": 50,
  "maxPages": 5
}
```

双色球初始化参数：

```json
{
  "action": "syncHistory",
  "lotteryType": "ssq",
  "page": 1,
  "pageSize": 50,
  "maxPages": 5
}
```

返回 `nextPage` 后继续执行下一批，直到 `stopped` 为 `true`。

## 6. 同步最新一期

测试参数（大乐透）：

```json
{
  "action": "syncLatest",
  "lotteryType": "dlt"
}
```

测试参数（双色球）：

```json
{
  "action": "syncLatest",
  "lotteryType": "ssq"
}
```

## 7. 定时触发器

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
    },
    {
      "name": "sync-ssq-draw-window",
      "type": "timer",
      "config": "0 25-50 21 * * TUE,THU,SUN *"
    }
  ]
}
```

大乐透开奖日：周一、周三、周六
双色球开奖日：周二、周四、周日

## 8. 发布前检查

- 首页能切换彩种并加载最近一期
- 历史查询能按年份、日期、期号查询
- 同日查询能显示无开奖和相邻期
- 说明页明确无销售、无预测、无投注交易
- 服务类目和审核材料已准备
