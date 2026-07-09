import { google } from 'googleapis';
import oAuth2Client from '../src/services/google-auth';
import { CONFIG } from '../src/config/constants';

const TAB = 'checkout_messages';

// ─── checkout_reminder ───────────────────────────────────────────────────────

const CHECKOUT_EN = `*Checkout Instructions – Thank You for Staying with Us!*

Dear Guest,

We hope you've had a wonderful stay! As your departure date approaches, here are a few things to help make checkout smooth and hassle-free.

*⏰ Checkout Time*
Please plan to check out by 11:00 AM to allow us time to prepare for our next guests.
We always support your check-out — if you need airport transportation, please book at least 12 hours in advance.

*📌 Before You Leave*

*Tidy Up:* Kindly gather your belongings and ensure nothing is left behind.
*Trash Disposal:* Place all trash in the designated bins. Food waste can be ground using the disposer in the sink.
*Dishes:* Wash any used dishes or place them in the dishwasher and start the cycle.
*Used Towels:* Please run the washing machine before your departure.
Please place the guest smartphone and pocket wifi (if used) back on the living room table.

*🔑 Keys*
Make sure you place the main gate key back in the key box (if your home has a main gate and key box).

*💳 Payment of Expenses*
If you incurred additional expenses during your stay (tour fees, food delivery, etc.) and were informed in advance, please prepare payment in cash and leave it on the living room table.
If you prefer bank transfer or credit card, please note an additional 10% VAT applies.

*📢 Let Us Know*
If there are any damages or issues we should be aware of, please inform us before checking out.

Thank you for being such wonderful guests! We hope to welcome you back soon. Safe travels!

Warm regards,
Cozmo, Guest Care Team of COZE Hospitality 3.0`;

const CHECKOUT_KR = `*체크아웃 안내*

안녕하세요!
저희 숙소에서 편안한 시간을 보내셨기를 바랍니다! 체크아웃 시간이 다가옴에 따라, 원활한 체크아웃을 위해 몇 가지 안내 사항을 공유드립니다.

*⏰ 체크아웃 시간*
당일 체크인이 있기 때문에 오전 11시까지 체크아웃을 완료해 주시면 감사하겠습니다.
공항 이동 등 교통 지원이 필요하신 경우, 미리 알려주시면 저희가 팔로업 드릴게요!

*📌 체크아웃 전*

*정리:* 모든 소지품을 챙기시고 잊으신 물건이 없도록 확인해 주세요.
*쓰레기 처리:* 모든 쓰레기는 지정된 쓰레기통에 넣어 주시고, 음식물 쓰레기는 싱크대에 있는 분쇄기를 사용해 처리해 주세요.
*식기:* 사용한 식기는 세척하시거나 식기세척기에 넣고 세척을 시작해 주세요.
*수건:* 사용한 수건은 출발 전 세탁기를 돌려주시길 부탁드립니다.
*기기 반납:* 게스트용 스마트폰과 포켓 와이파이(사용한 경우)는 거실 테이블 위에 두어 주세요.

*🔑 열쇠*
숙소에 메인 게이트와 열쇠 박스가 있는 경우, 열쇠를 열쇠 박스에 다시 넣어 주세요.

*💳 추가 비용 결제*
체류 중 투어 비용, 음식 배달비 등 추가 비용이 발생한 경우, 사전에 안내받으신 금액을 현금으로 준비하시고 거실 테이블 위에 놓아 주세요!
계좌이체가 필요 시, 계좌 정보: 우리은행 1005-603-401810 이혜정(조이하슬라)

*📢 알려주세요*
체크아웃 전에 손상된 물품이나 문제 사항이 있다면 꼭 알려주시길 바랍니다.

멋진 게스트로 머물러 주셔서 감사합니다! 앞으로 다시 뵙기를 기대합니다. 안전한 여행 되세요!

COZE Hospitality 3.0 게스트 케어 팀 드림`;

const CHECKOUT_JA = `*チェックアウトのご案内 – ご宿泊ありがとうございました！*

親愛なるゲストの皆さまへ

この度は当宿をご利用いただき、誠にありがとうございました。ご出発にあたり、スムーズにチェックアウトいただけるよう、以下のご案内を差し上げます。

*⏰ チェックアウト時間*
午前 11:00 までにチェックアウトをお願いいたします。
次のお客様をお迎えする準備のため、ご協力をお願いいたします。
空港送迎などの交通サポートが必要な場合は、少なくとも 12時間前までにご予約ください。

*📌 ご出発前にご確認ください*

*お荷物整理:* お忘れ物がないよう、身の回り品をすべてお持ちください。
*ゴミの処理:* すべてのゴミは指定のゴミ箱に入れてください。食べ残しはキッチンシンクのディスポーザーで粉砕処理いただけます。
*食器:* 使用した食器は洗っていただくか、食洗機に入れて運転を開始してください。
*使用済みタオル:* ご出発前に洗濯機を回していただけますようお願いいたします。
*貸出機器:* ゲスト用スマートフォンやポケットWi-Fi（ご利用の場合）はリビングのテーブルにご返却ください。

*🔑 鍵について*
物件にメインゲートとキーボックスがある場合は、必ず大門の鍵をキーボックスにお戻しください。

*💳 ご精算について*
ご滞在中に発生した追加費用（ツアー料金やフードデリバリー代など）が事前に案内されている場合は、現金でご用意いただき、リビングテーブルに置いてください。
銀行振込またはクレジットカードでのお支払いをご希望の場合は、韓国の付加価値税（VAT）規定に基づき10%の税金が加算されますので、ご了承ください。

*📢 ご連絡事項*
お部屋に破損や不具合がございましたら、チェックアウト前に必ずお知らせください。

素敵なご滞在をありがとうございました！またお会いできる日を楽しみにしております。どうぞお気をつけてお帰りくださいませ。

心を込めて、
Cozmo, Guest Care Team of COZE Hospitality 3.0`;

const CHECKOUT_ZH_CN = `*退房须知 – 感谢您选择入住我们！*

亲爱的客人，

我们希望您在此度过了一个愉快的时光！随着您离店日期的临近，以下退房须知希望能让您的离店过程顺利、轻松。

*⏰ 退房时间*
请您务必在 上午11:00 前完成退房，以便我们有充足的时间为下一位客人准备。
如需机场接送等交通服务，请至少提前 12 小时预约。

*📌 离开前请注意*

*整理物品:* 请收拾好随身物品，确保没有遗落。
*垃圾处理:* 请将所有垃圾投入指定垃圾桶。厨余垃圾可使用厨房水槽的垃圾处理器粉碎。
*餐具:* 请清洗使用过的餐具，或将其放入洗碗机并启动清洗程序。
*毛巾:* 请在离开前将使用过的毛巾放入洗衣机运行清洗。
*设备归还:* 请将提供的客人专用手机、随身 Wi-Fi（如有使用）放回客厅桌上。

*🔑 钥匙*
如果您的房源有大门及钥匙盒，请将大门钥匙放回钥匙盒中。

*💳 额外费用支付*
若您在住宿期间产生了额外费用（如旅行团费、餐饮外送费等）并已事先告知，请准备好现金并放在客厅桌上。
如您希望通过银行转账或信用卡支付，请注意需额外收取 10% 增值税（VAT）。

*📢 告知事项*
若房间有任何损坏或需要我们注意的问题，请在退房前告知我们。

感谢您成为如此可爱的客人！我们真诚期待再次为您服务。祝您旅途平安！

温馨问候，
Cozmo, Guest Care Team of COZE Hospitality 3.0`;

// ─── payment_reminder ─────────────────────────────────────────────────────────

const PAYMENT_EN = `*🌟 Expense & Payment 🌟*

During your stay, you might incur various expenses such as airport van pick-ups 🚐, food deliveries 🍕, shopping orders 📦, or exciting tours 🎡! Our COZE team usually covers these upfront to make your stay more comfortable. 😊

*📌 Settlement Timing*
We'll summarize your expenses and inform you of the total one day before check-out. You can settle all charges at once when you check out :)

*💡 Payment Methods & Tips*

*1️⃣ Cash (Recommended) 💵*
The most economical option — avoids the non-refundable 10% VAT charge.

*2️⃣ Cryptocurrency (e.g., USDT) 🪙*
Easy crypto payment, increasingly popular among our guests!

*3️⃣ WISE APP*
https://wise.com/us/money-transfer-app/
Real exchange rate with transparent fees — very cheap!!
Note: additional 10% VAT applies.

*4️⃣ Local Bank Transfer 🏦*
Transfer from your local bank to our same-country account (like a local transfer).
Available currencies: USD / KRW / EUR / AUD / CNY / GBP / HKD / JPY / SGD
Note: 10% VAT applies.

*5️⃣ Credit Card 💳 (Least Recommended)*
Extra fees apply:
• ~4.5% credit card service fee
• Charged in KRW — double currency conversion
• Potential overseas transaction fees from your card issuer

We highly recommend cash or cryptocurrency for convenience and cost savings. ✨

Thank you for your understanding! Enjoy your stay with COZE. 💖

Warm regards,
Gaya, Guest Care Team of COZE Hospitality 3.0`;

const PAYMENT_KR = `*🌟 추가 비용 & 결제 안내 🌟*

체류 중 공항 밴 픽업 🚐, 음식 배달 🍕, 쇼핑 대행 📦, 투어 🎡 등 다양한 추가 비용이 발생할 수 있습니다. COZE 팀이 먼저 결제하거나 서비스를 직접 제공해 드립니다. 😊

*📌 정산 시점*
체크아웃 하루 전에 추가 비용 내역과 총액을 안내해 드립니다. 체크아웃 시 한 번에 정산하시면 됩니다 :)

*💡 결제 방법 & 안내*

*1️⃣ 현금 (추천) 💵*
가장 경제적인 방법 — 환불 불가 10% VAT가 발생하지 않습니다.

*2️⃣ 암호화폐 (예: USDT) 🪙*
간편한 암호화폐 결제, 게스트들 사이에서 인기가 높아지고 있습니다!

*3️⃣ WISE 앱*
https://wise.com/us/money-transfer-app/
실시간 환율 및 투명한 수수료 — 매우 저렴합니다!!
단, 추가 10% VAT가 발생합니다.

*4️⃣ 국내 은행 이체 🏦*
본국 은행에서 동일 국가 내 당사 계좌로 이체 (국내 이체 방식).
가능 통화: USD / KRW / EUR / AUD / CNY / GBP / HKD / JPY / SGD
단, 10% VAT가 추가됩니다.

*5️⃣ 신용카드 💳 (비추천)*
추가 수수료가 발생합니다:
• 약 4.5% 신용카드 수수료
• 한국 원화(KRW) 결제 — 이중 환율 적용
• 해외 거래 수수료 (카드사 정책에 따라 다름)

편의성과 비용 절감을 위해 현금 또는 암호화폐를 강력히 추천드립니다. ✨

이해해 주셔서 감사합니다! COZE에서의 즐거운 시간 되세요. 💖

따뜻한 인사를 전하며,
가야, COZE Hospitality 3.0 게스트 케어 팀`;

const PAYMENT_JA = `*🌟 お支払い・精算のご案内 🌟*

ご滞在中、空港送迎バン 🚐、フードデリバリー 🍕、お買い物代行 📦、ツアー体験 🎡 など、さまざまな追加費用が発生する場合がございます。COZEチームが一時的に立替え、快適にお過ごしいただけるようサポートいたします。😊

*📌 精算のタイミング*
チェックアウトの前日に、追加費用の明細と合計金額をご案内します。チェックアウト時にまとめてお支払いいただけます :)

*💡 お支払い方法とポイント*

*1️⃣ 現金（おすすめ）💵*
最もお得な方法 — 返金不可の10% VAT（付加価値税）がかかりません。

*2️⃣ 暗号資産（例：USDT）🪙*
暗号資産でのお支払いも可能です。最近ご利用されるゲストが増えています！

*3️⃣ WISEアプリ*
https://wise.com/us/money-transfer-app/
実勢レートで透明な手数料 — とてもお得です！
ただし、追加で10% VATが発生します。

*4️⃣ ローカル銀行振込 🏦*
お住まいの国の銀行から当方の同国内口座へ送金（ローカル振込のイメージ）。
対応通貨: USD / KRW / EUR / AUD / CNY / GBP / HKD / JPY / SGD
10% VATを加算する必要があります。

*5️⃣ クレジットカード（非推奨）💳*
追加費用が発生します：
• 約4.5%のカード決済手数料
• KRW建て決済による二重換算
• カード会社の海外利用手数料（カードによる）

利便性と費用面から、現金または暗号資産でのお支払いをおすすめしております。✨

ご理解とご協力、誠にありがとうございます！COZEでのご滞在をどうぞお楽しみください。💖

心を込めて、
COZE Hospitality 3.0 ゲストケアチーム Gaya`;

const PAYMENT_ZH_CN = `*🌟 费用与付款 🌟*

在您入住期间，可能会产生机场接送费 🚐、餐饮外卖 🍕、购物订单 📦 或精彩的观光活动 🎡 等各类费用！COZE 团队通常会先行垫付，让您住得更省心舒适。😊

*📌 结算时间*
在退房前一天，我们会汇总所有费用并告知总金额，退房时一次性支付即可。

*💡 付款方式与小贴士*

*1️⃣ 现金（推荐）💵*
最划算 — 不产生不可退还的 10% 增值税 (VAT)。

*2️⃣ 加密货币（如 USDT）🪙*
可轻松使用加密货币付款，越来越多客人选择这种方式！

*3️⃣ WISE 转账 APP*
https://wise.com/us/money-transfer-app/
实时汇率、透明低廉的手续费 — 非常划算！
⚠️ 使用 WISE 需外加 10% 增值税。

*4️⃣ 本地银行转账 🏦*
从所在国家/地区的银行，直接以本币汇款至我们在同一国家/地区的账户。
可用币种: USD / KRW / EUR / AUD / CNY / GBP / HKD / JPY / SGD
⚠️ 需外加 10% 增值税。

*5️⃣ 信用卡 💳（最不推荐）*
信用卡付款会产生额外费用：
• 约 4.5% 信用卡服务费
• 以韩元 (KRW) 计费，造成双重货币转换
• 发卡行可能收取海外交易手续费

我们强烈推荐使用现金或加密货币，既便捷又省钱！✨

感谢您的理解与配合，祝您在 COZE 度过愉快的时光！💖

温馨问候，
COZE Hospitality 3.0 客户关怀团队 Gaya`;

// ─── farewell_reminder ────────────────────────────────────────────────────────

const FAREWELL_EN = `*Hello! 😊*

We hope you've had a wonderful stay and created some beautiful memories during your time here. 🏡✨

Every place — just like life — comes with a mix of comforts and little inconveniences. Although we're not a traditional hotel, we strive to offer something warmer — a home filled with genuine care, comfort, and heart. 🌿✨

Our greatest hope is that you felt at ease and enjoyed both the charm of local living and the cozy comfort we always aim to provide.

*Thank you from the bottom of our hearts for staying with us.*
Wishing you safe travels, and we genuinely look forward to welcoming you back again soon! ✈️🌎

With warmest regards,
Gaya, Guest Care Team
COZE Hospitality 3.0 🌿`;

const FAREWELL_KR = `*안녕하세요! 저는 COZE 서비스팀 가야입니다. 😊*

체크아웃 후 다음 목적지로 편안하게 이동하셨는지 궁금합니다.

저희 팀은 항상 숙소를 최고의 상태로 유지하기 위해 최선을 다하고 있지만, 실제로 그 공간에서 생활하지 않기 때문에 게스트님이 경험하신 부분이 무엇보다 큰 도움이 됩니다. 아주 사소한 것이라도 느끼신 점이 있다면 편하게 말씀해 주세요.

남겨주시는 의견은 다음 게스트를 더 세심하게 케어하는 데 큰 힘이 됩니다.

*다음 여행에서도 다시 인연이 닿기를 바라며, 늘 건강하고 행복한 날들만 가득하시길 바랍니다 ^^*

COZE Hospitality 3.0
"All you need, All-In-One, All yours"`;

const FAREWELL_JA = `*こんにちは！😊*

今回のご滞在が素敵な思い出となり、心地よい時間をお過ごしいただけたことを願っております。🏡✨

どんな空間も、そして人生も、心地よさと小さな不便が混ざり合うものです。私たちは一般的なホテルではありませんが、その分「より温かく、より心のある滞在」をお届けしたいと思っています。🌿✨

ここでの時間が少しでも安らぎとなり、ローカルらしい暮らしの魅力と、私たちが大切にしている「くつろぎ」を感じていただけていたら嬉しいです。

*この度はご宿泊いただき、本当にありがとうございました。*
ご旅行の続きもどうか安全に、そしてまたいつかお会いできる日を心から楽しみにしています。✈️🌎

心を込めて、
Gaya
COZE Hospitality 3.0 ゲストケアチーム 🌿`;

const FAREWELL_ZH_CN = `*您好！😊*

我们真心希望您在这里度过了一段愉快的时光，也留下了美好的旅行回忆。🏡✨

每一个居住空间 — 就像生活一样 — 既有舒适之处，也会有些许不便。虽然我们并不是传统意义上的酒店，但我们始终努力提供更温暖的体验：一个充满关怀、舒适与真心的家。🌿✨

我们最大的心愿，是您能在这里感到放松自在，同时体验到当地生活的魅力与我们悉心准备的舒适感。

*非常感谢您选择入住我们这里，祝您旅途顺利，也真诚期待未来再次欢迎您回来！✈️🌎*

最诚挚的祝福，
Gaya
COZE Hospitality 3.0 客户关怀团队 🌿`;

// ─── main ─────────────────────────────────────────────────────────────────────

async function run() {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    const spreadsheetId = CONFIG.SHEET_ID;

    const header = ['key', 'EN', 'KR', 'JA', 'ZH-CN', 'ZH-TW'];
    const rows = [
        header,
        ['checkout_reminder', CHECKOUT_EN, CHECKOUT_KR, CHECKOUT_JA, CHECKOUT_ZH_CN, ''],
        ['payment_reminder',  PAYMENT_EN,  PAYMENT_KR,  PAYMENT_JA,  PAYMENT_ZH_CN,  ''],
        ['farewell_reminder', FAREWELL_EN, FAREWELL_KR, FAREWELL_JA, FAREWELL_ZH_CN, ''],
    ];

    const meta0 = await sheets.spreadsheets.get({ spreadsheetId });
    const exists = meta0.data.sheets?.some(s => s.properties?.title === TAB);
    if (!exists) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
        });
        console.log(`📋 Created tab: ${TAB}`);
    } else {
        await sheets.spreadsheets.values.clear({ spreadsheetId, range: TAB });
    }

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
    });

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetId = meta.data.sheets?.find(s => s.properties?.title === TAB)?.properties?.sheetId ?? 0;

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [
                {
                    repeatCell: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                        cell: { userEnteredFormat: { textFormat: { bold: true } } },
                        fields: 'userEnteredFormat.textFormat.bold',
                    },
                },
                {
                    updateSheetProperties: {
                        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                        fields: 'gridProperties.frozenRowCount',
                    },
                },
                {
                    repeatCell: {
                        range: { sheetId },
                        cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
                        fields: 'userEnteredFormat.wrapStrategy',
                    },
                },
                {
                    updateDimensionProperties: {
                        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
                        properties: { pixelSize: 200 },
                        fields: 'pixelSize',
                    },
                },
                {
                    updateDimensionProperties: {
                        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 6 },
                        properties: { pixelSize: 420 },
                        fields: 'pixelSize',
                    },
                },
            ],
        },
    });

    console.log('✅ checkout_messages updated: checkout_reminder, payment_reminder, farewell_reminder (all with bold formatting)');
}

run().catch(e => {
    console.error('❌ Failed:', e?.message);
    process.exit(1);
});
