# Webhookとワーカー

配信は **at-least-once**。exactly-onceは保証しない。DBコミット前には送らず、業務トランザクション内のoutboxを独立workerが配信する。

`event_id`は再送で不変。配信試行ごとに新しいdelivery ID。payloadはtype、created_at、resource_id、resource_version、generation、必要な金額・状態・注文参照を含む。秘密承認トークンは含めない。

```text
ExPress-Signature: t=UNIX_SECONDS,v1=HMAC_HEX
signed_value = timestamp + "." + raw_body
algorithm = HMAC-SHA256
```

SDK `verifyWebhook(rawBody, signature, secrets)` はraw bodyを使い、定時間比較、5分の許容幅、形式検査を行う。workerは再送のたびに新しい実時刻で署名する。workspace業務時計は署名検証に使わない。

```ts
import { verifyWebhook } from '@exw/sdk-server';
if (!verifyWebhook(rawBody, signatureHeader, [newKey, oldKey])) {
  throw new Error('Invalid ExPress signature');
}
```

鍵更新後24時間は `t=...,v1=新鍵署名,v1=旧鍵署名` を送信する。旧鍵だけを持つ受信者も移行中は受信できる。SDKは新旧鍵配列のいずれかに合う署名を検証する。24時間後は新鍵だけで送信し、受信側でも旧鍵を削除する。秘密鍵の再表示APIはない。サンプルECの「Webhook署名鍵を更新」はAPIで鍵を更新し、受信側の暗号化保存も更新する。

workerのjob claimは `FOR UPDATE SKIP LOCKED`、15秒lease。Webhook配信もleaseを持つ。プロセス停止後、lease失効で回復する。失敗時は指数バックオフ＋jitter、最大6試行、dead_letter。手動再送は同じevent IDを参照する。加盟店は `POST /v1/webhook-deliveries/{id}/retry`（任意のIdempotency-Keyで重複再送を防止）、運営者は `POST /v1/admin/webhook-deliveries/{id}/retry`（理由必須・監査ログ、処理中の配信は不可）で再送できる。通知失敗は決済成功を失敗へ戻さない。開発者ポータルのWebhookタブに `verifyWebhook` を使った署名検証例を表示する。

ECは署名検証後、event IDで重複排除し、ExPress APIの最新状態へ照会する。状態はresource versionが古い場合に戻さない。発送はcapture_id一意で作成する。照会が失敗したらeventを受領済みにせず、再送で回復する。

## SSRF

通知先は管理者の完全一致許可リスト内。公開モードはHTTPS・公開DNSのみ。登録時と配信時にDNSを検査し、プライベート・loopback・link local等を拒否する。検証済みIPへlookupを固定し、Host/TLSは元のホスト名を維持する。リダイレクトは追従しない。タイムアウト5秒、レスポンス64KiB上限。

ローカル例外は設定済みのサンプルEC `/webhooks/express-wallet` だけ。訪問者が自由な外部ホストへの通信を指示することはできない。
