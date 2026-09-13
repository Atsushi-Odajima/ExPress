# 台帳

全金額はJPYの最小通貨単位。APIの金額は10進整数文字列、アプリ内はBigInt、DBはBIGINT。浮動小数を用いた金額計算は行わない。USD等は拒否する。

`journal_entries` と `journal_lines` が正本。勘定のbalanceは同一トランザクション内のキャッシュで、運営レポートで再計算できる。DBトリガーは確定後のUPDATE/DELETE、コミット後の行追加、借貸不一致、空仕訳を拒否する。

|操作|借方|貸方|
|---|---|---|
|模擬チャージ|platform / external|利用者 / available|
|ウォレットオーソリ|利用者 / available|利用者 / held|
|ウォレットcapture|利用者 / held（総額）|加盟店 / unsettled（純額）、platform / fees|
|模擬カードcapture|platform / external|加盟店 / unsettled（純額）、platform / fees|
|未確定分解放|利用者 / held|利用者 / available|
|P2P|送金者 / available|受取人 / available|
|精算|加盟店 / unsettled|加盟店 / available|
|出金申請|対象者 / available|対象者 / payout_held|
|出金成功|対象者 / payout_held|platform / external|
|出金失敗|対象者 / payout_held|対象者 / available|
|返金予約|加盟店 / available、unsettled|加盟店 / refund_held|
|残高返金成功|加盟店 / refund_held|元利用者 / available|
|カード返金成功|加盟店 / refund_held|platform / external|
|返金失敗|加盟店 / refund_held|予約時の原資勘定|
|管理者増額訂正|platform / external|対象者 / available|

勘定は所有者ごとの補助勘定。externalは借方残高の資産、available/held/unsettled/payout_held/refund_heldは貸方残高の負債、feesは貸方の収益。勘定ロックをID順に取り、残高が負になる仕訳を拒否する。

手数料はデモ初期値3%＋30円、率部分切捨て。captureごとに当時のbasis points/固定額/返却なしをsnapshotへ保存する。手数料がcapture金額以上になる少額captureは拒否する。実サービスの料率ではない。

1,000円captureでは手数料60円、加盟店純額940円。全額返金には1,000円分の加盟店原資が必要で、940円しかなければ `INSUFFICIENT_REFUND_FUNDS`。模擬追加入金で不足分を補える。運営者による自動立替はしない。

返金原資はavailable→古いunsettledロットの順。出金保留は利用不可。ロットのreservedとreleasedを記録し、返金予約が残るロットは精算を待つ。返金成功でreleasedへ移し、失敗ならreservedを取り消す。

各仕訳のbusiness_eventにはworkspace/generationを含む一意制約がある。訂正は理由・参照・対向勘定付き仕訳とし、キャッシュの直接編集APIは用意しない。運営者の調整を訂正する場合は元の仕訳への参照を持つ反対仕訳を記録する。確定済み決済は返金APIで処理する。

台帳レポートは借貸一致、キャッシュ再計算に加え、チャージ/送金/capture/返金/出金と仕訳額、オーソリの確定/予約/解放、captureの手数料と精算ロット、注文の集計、利用者保留/加盟店未精算/返金保留/出金保留と業務予約額を独立に再計算する。不一致のresource ID、rule、expected、actualを運営者に表示する。
