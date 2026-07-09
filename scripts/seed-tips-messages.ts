import { google } from 'googleapis';
import oAuth2Client from '../src/services/google-auth';
import { CONFIG } from '../src/config/constants';

const TAB = 'tips_messages';

const EN = `🍳 *COZE Breakfast Grocery Option* 🍎

Hello, lovely guests! 👋✨

*🕰 When & How It's Delivered*
Depending on your arrival time:

For early/regular check-ins, your breakfast groceries will be prepared inside the home (fridge & kitchen) before you arrive, or

For late check-ins, they'll be delivered to the main gate at 6 AM on the following morning.


*♻ After Unpacking*

After you unpack everything, please place the empty delivery bag back outside the gate for pick-up.

Cardboard boxes → recycling bin ♻

Plastic wrap/packaging → regular trash 🚮


*📲 Daily Breakfast Refills*
Need more goodies during your stay?
Just send us a message—orders close every night at 9 PM, and we'll arrange delivery the next morning.

*💛 Complimentary Breakfast Staples from COZE*
🥖 Bread • 🥛 Milk • 🥚 Eggs • 🧃 Juice • 🍎 Fruit • ☕ Coffee • 🍵 Tea

*🛒 Anything Else on Your List?*
If you'd like additional items (yogurt, snacks, special drinks, etc.), we're happy to purchase them for you.
These will be supplied at cost, and the total will be added to your final bill at checkout.

Thank you for helping us keep things smooth, comfortable, and sustainable. 🌞
Warmly,
Gaya, Guest Care Team
COZE Hospitality 3.0
All you want, All-In-One, All yours`;

const KR = `🍳 *COZE 조식 식자재 옵션 안내* 🍎

안녕하세요, 사랑하는 게스트 여러분! 👋✨

*🕰 제공 시간 & 방식*
게스트 여러분의 도착 시간에 따라:

이른 체크인 / 일반 체크인: 체크인 전, 미리 집 안 냉장고와 주방에 세팅되거나

늦은 체크인: 체크인 다음날 아침 6시에 메인 게이트 앞으로 배송됩니다.


*♻ 언패킹 후 정리 방법*

식자재를 꺼낸 뒤, 빈 배송 가방은 게이트 밖에 다시 내놓아 주세요.

종이 박스는 → 재활용 쓰레기통 ♻

비닐 포장재는 → 일반 쓰레기 🚮


*📲 매일 조식 추가 주문*
추가로 필요하신 식자재가 있으면 언제든지 메시지로 알려 주세요.
매일 밤 9시까지 접수된 주문은 다음날 아침 배송해드립니다.

*💛 COZE가 무료로 제공하는 기본 조식 식자재*
🥖 빵 • 🥛 우유 • 🥚 계란 • 🧃 주스 •  🍎 과일 • ☕ 커피 • 🍵 티

*🛒 추가로 원하시는 품목이 있으신가요?*
원하시는 다른 식자재도 대신 구입해 드립니다.
이 경우, 실제 구입가 그대로 체크아웃 시 정산서에 합산되어 청구됩니다.

지속 가능하고 편안한 여행을 위해 함께해 주셔서 감사합니다. 🌞
게스트 케어 팀 가야 드림
COZE Hospitality 3.0
All you want, All-In-One, All yours`;

const JA = `🍳 *COZE 朝食食材デリバリーオプションのご案内* 🍎

ゲストの皆さま、ようこそお越しくださいました！👋✨

*🕰 提供時間と方法*
ご到着のお時間に合わせて、以下のいずれかの方法でご用意いたします。

早め／通常のチェックインの場合：チェックイン前に、冷蔵庫とキッチンに朝食食材をセットしておきます。

夜遅いチェックインの場合：チェックイン翌日の朝 6 時にエントランス前へお届けいたします。


*♻ 開封後のお願い*

食材を取り出したあとの空のデリバリーバッグは、再びエントランスの外に出しておいてください。スタッフが回収いたします。

段ボール箱 → リサイクル用ゴミ ♻

ビニール包装 → 可燃ゴミ／一般ゴミ 🚮


*📲 毎日の朝食追加オーダー*
ご滞在中に朝食食材を追加したい場合は、チャットメッセージでお知らせください。
毎日21:00 までのご注文は、翌朝にお届けいたします。

*💛 COZE が無料でご用意する基本の朝食セット*
🥖 パン • 🥛 牛乳 • 🥚 卵 • 🧃 ジュース • 🍎 フルーツ • ☕ コーヒー • 🍵 ティー

*🛒 その他に欲しいものがある場合*
ヨーグルト、お菓子、特別な飲み物など、追加でご希望の食材も代理購入いたします。
その場合は、実際の仕入れ価格（原価）でご提供し、チェックアウト時のご精算に合算させていただきます。

快適でサステナブルなご滞在のために、ご協力ありがとうございます。🌞
COZE Hospitality 3.0 ゲストケアチーム
Gaya`;

const ZH_CN = `🍳 *COZE 早餐食材配送选项说明* 🍎

亲爱的客人，欢迎来到 COZE！👋✨

*🕰 提供时间与方式*
根据您的抵达时间，我们会安排不同的方式：

较早或正常时间入住：我们会在您入住前，提前把早餐食材放入房内冰箱和厨房；

晚间入住：早餐食材会在次日早上 6 点送到大门口，方便您一早取用。


*♻ 取出食材后的处理方式*

取出所有食材后，请将空的配送袋放回大门外，我们会上门回收。

纸箱 → 可回收垃圾 ♻

塑料包装 → 一般垃圾 🚮


*📲 每日早餐追加服务*
如果在入住期间需要追加早餐或其他食材，只需通过聊天消息告诉我们即可。
每天晚间 9 点前确认的订单，会在次日早上为您送达。

*💛 COZE 免费提供的基础早餐食材*
🥖 面包 • 🥛 牛奶 • 🥚 鸡蛋 • 🧃 果汁 • 🍎 水果 • ☕ 咖啡 • 🍵 茶

*🛒 想要更多选择？*
例如酸奶、小零食、饮料等其他物品，我们也可以代为采购。
此类额外物品将以实际采购成本价计入，统一在退房结算时一并收费。

感谢您与我们一起，让旅程变得更舒适、更环保。🌞
Gaya 敬上
COZE Hospitality 3.0
All you want, All-In-One, All yours`;

const RULES_EN = `*Please keep these house rules* 🙏

Let our joy flow into peaceful nights for neighbors 🕊️

⏰ Check-in 3:00 PM
⏰ Check-out 11:00 AM (next day)

*🏡 Noise ZERO*
This is a very quiet residential area—even small sounds travel.
Keep all windows fully closed 🔒 (open windows carry sound farther).
After 19:00, noise over 65 dB for 5+ minutes will trigger a noise alarm 🚨
Please avoid slamming doors/furniture or running in the hallway.

*🛋️ Do not move furniture*
No furniture relocation. If an adjustment is truly needed, get prior approval from the host.

*🚭 Smoking*
No smoking indoors—it may trigger the IoT fire alarm.
Smoke only in designated outdoor areas and keep voices low at night.

*♻️ Trash & Recycling*
Separate general waste and recyclables (plastic/cans/bottles) and use the designated area.
*Food waste:* always use the food disposer; bones/hard shells/seeds → general waste 🥜
If you have a lot of food waste, bag it and leave it at the door at checkout—our house-care team will handle it 🙌

*🔒 Safety & Energy*
Be mindful of accidents related to heavy drinking 🤕
No fireworks/open flames—strictly prohibited 🚫🔥
Watch children on the stairs 👶
Right after check-in, take extra care until you're familiar with the space ⚠️
Turn off gas/lights/AC when leaving or checking out 🔌

*🚗 Parking*
Park only in spaces designated by our concierge.
Unauthorized/illegal parking may lead to neighbor complaints & fines; repeated issues jeopardize our business 😢

*🆘 Need help?*
Message us anytime or call Host Gaya at 010-6690-6935.
We respond 24/7. Thank you for your kindness! 🌙✨

Warmly,
Gaya, Guest Care Team of COZE Hospitality 3.0`;

const RULES_KR = `*이것만은 꼭 지켜주세요* 🙏

우리의 즐거움이 이웃의 평화로 이어지는 매직 🕊️

⏰ 체크인 오후 3시
⏰ 체크아웃 다음날 오전 11시

*🏡 소음 ZERO!*
이곳은 아주 평화로운 주거지역이에요. 작은 소리도 이웃의 수면을 방해할 수 있어요.
모든 창문은 꼭 닫기 🔒 (열려 있으면 소음이 훨씬 멀리 퍼져요)
19:00 이후 65 dB 이상의 소리가 5분 이상 지속되면 소음경보가 울립니다 🚨
문·가구를 '쿵' 닫거나 복도를 달리는 행동은 피해주세요.

*🛋️ 가구 이동 금지*
가구 위치 변경은 절대 금지입니다. 꼭 필요한 경우 호스트의 사전 동의를 받으세요.

*🚭 흡연 안내*
실내 금연입니다. 흡연 시 IoT 화재경보기가 작동할 수 있어요.
흡연은 외부 지정 구역에서만, 밤에는 담소도 조용히 부탁드립니다.

*♻️ 쓰레기 & 재활용*
일반 쓰레기와 재활용(플라스틱·캔·병)을 꼭 분리하여 지정된 곳에 버려주세요.
*음식물 쓰레기:* 반드시 음식물 처리기 사용!
뼈·딱딱한 껍질·씨앗은 일반 쓰레기로 🥜
음식물 쓰레기가 과도하게 많다면, 비닐봉지에 담아 체크아웃 시 문 앞에 두시면 하우스케어 팀이 처리합니다 🙌

*🔒 안전 & 에너지 절약*
과음으로 인한 안전사고 주의 🤕
불꽃놀이·폭죽 등 화기 사용 절대 금지 🚫🔥
계단 이용 시 어린이 안전을 꼭 확인하세요 👶
체크인 직후엔 공간이 낯설 수 있으니 익숙해질 때까지 주의해 주세요 ⚠️
외출·퇴실 시 가스·전등·에어컨 OFF 확인 🔌

*🚗 주차*
컨시어지 팀 안내에 따라 지정 구역에만 주차해 주세요.
임의·불법 주차는 이웃 민원 → 범칙금으로 이어질 수 있으며, 반복 시 숙소 영업이 어려워집니다 😢

*🆘 도움이 필요할 때*
언제든 호스트 가야 010-6690-6935 또는 숙소 채팅으로 연락 주세요.
24시간 빠르게 응답하겠습니다! 🌙✨`;

const RULES_JA = `*これだけは守ってください* 🙏

楽しい滞在がご近所の平和につながる魔法 🕊️

⏰ チェックイン 15:00
⏰ チェックアウト 翌日 11:00

*🏡 騒音ゼロ*
ここはとても静かな住宅街です。小さな音でも睡眠を妨げることがあります。
窓は必ずしっかり閉めてください 🔒（開いていると音が遠くまで届きます）
19:00以降に 65 dB 超の音が5分以上続くと騒音アラームが作動します 🚨
ドアや家具を強く閉める／廊下を走る行為はお控えください。

*🛋️ 家具の移動は厳禁*
家具の位置変更は禁止です。必要な場合は必ず事前にホストの承認を得てください。

*🚭 喫煙について*
室内は禁煙です。喫煙すると IoT 火災警報器が作動する場合があります。
喫煙は指定の屋外エリアのみで、夜間のおしゃべりはお静かに。

*♻️ ゴミとリサイクル*
一般ゴミとリサイクル（プラスチック・缶・瓶）を必ず分別し、指定場所へ。
*生ごみ：* 必ずフードディスポーザーを使用してください。
骨・硬い殻・種は一般ゴミへ 🥜
生ごみが多い場合は袋にまとめ、チェックアウト時に玄関前へ置いてください。ハウスケアチームが回収します 🙌

*🔒 安全・省エネ*
飲酒による事故にご注意ください 🤕
花火・爆竹など火気の使用は厳禁 🚫🔥
階段の上り下りはお子さまに特に注意を 👶
到着直後は空間に慣れるまで十分ご注意ください ⚠️
外出・退室時はガス・照明・エアコンのOFFを確認 🔌

*🚗 駐車*
コンシェルジュの案内に従い、指定区画のみに駐車してください。
無断・違法駐車は苦情や反則金の対象となり、繰り返されると営業継続が困難になります 😢

*🆘 お困りのときは*
ホスト Gaya（010-6690-6935） へお電話、またはチャットでご連絡ください。
24時間迅速に対応いたします 🌙✨`;

const RULES_ZH_TW = `*請務必遵守* 🙏

讓我們的歡樂化作鄰里的安寧 🕊️

⏰ 入住 15:00
⏰ 退房 次日 11:00

*🏡 噪音 ZERO*
這裡是非常安靜的住宅區，小聲音也可能打擾鄰居休息。
請務必將所有窗戶關好 🔒（打開時聲音會傳得更遠）
19:00 後若噪音超過 65 dB 並持續超過 5 分鐘，將觸發噪音警報 🚨
請避免用力摔門／搬動家具發出巨響，也不要在走廊奔跑。

*🛋️ 嚴禁移動家具*
請勿移動室內家具。如需調整，務必事先徵得房東同意。

*🚭 吸菸說明*
室內全面禁菸；吸菸可能觸發 IoT 火災警報器。
只可在指定戶外區域吸菸，夜間請放低音量。

*♻️ 垃圾與資源回收*
請將一般垃圾與資源回收（塑膠／鋁罐／玻璃瓶）確實分類並投放於指定地點。
*廚餘：* 務必使用食物處理機；骨頭／硬殼／種子請丟一般垃圾 🥜
若廚餘量多，請以塑膠袋打包，退房時放在門口，由Housecare 團隊處理 🙌

*🔒 安全與節能*
避免因過量飲酒造成意外 🤕
嚴禁煙火／爆竹等一切明火 🚫🔥
上下樓梯時請特別留意孩童安全 👶
剛入住對空間不熟悉，請在熟悉前多加注意 ⚠️
外出／退房時請確認瓦斯／燈光／空調關閉 🔌

*🚗 停車*
請依禮賓（Concierge）指示停放於指定區位。
未經允許或違規停車恐導致鄰里申訴與罰款；若屢次發生，將影響民宿營運 😢

*🆘 需要協助？*
隨時透過住宿聊天或致電 Gaya 010-6690-6935 聯繫我們，24 小時快速回覆！🌙✨`;

const FOOD_EN = `🍽️ *How to Order Food with the Guest Smartphone* (Coupang Eats)

Welcome to COZE Hospitality 3.0! Here's the easy way to get your favorite dishes delivered — even if your own credit card won't work in Korea 👇


1️⃣ Grab the fully-set guest phone 📱
Open Coupang Eats (already logged in and location-ready).

2️⃣ Fill your cart with deliciousness 🍕🍜🥟
Browse local restaurants, add everything you'd like, mix and match freely!

3️⃣ Take a full scroll screenshot 🖼️
Before tapping "Pay," swipe through the entire cart and capture it (most phones: Power + Vol-Down → "Scroll Capture").

4️⃣ Send the screenshot to the Concierge chat 💬
Drop the image into your dedicated channel — we'll check and confirm right away.

5️⃣ We pay for you 💳✨
Our team places the order using a Korean card so your food heads straight to your door.

6️⃣ Settle up at checkout 💵
Simply reimburse us in cash when you check out.
Card or bank transfer is possible, but please note they trigger extra fees (double VAT on transfers and foreign-card surcharges). Cash is easiest and cheapest!


*Why this system?*
Korean apps require local authentication, so overseas cards are blocked. The guest phone lets you shop, but cannot charge your own card. Think of our card as a friendly loan — the exact food cost is passed back to you, not treated as COZE revenue.

Enjoy your meal and your stay! 🍽️🏠😊`;

const FOOD_ZH_CN = `🍽️ *使用宾客手机点餐指南*（Coupang Eats）

欢迎来到 COZE Hospitality 3.0！
即使您的海外信用卡在韩国无法使用，也可以轻松点到您喜欢的美食 👇


1️⃣ 拿起已设置好的宾客专用手机 📱
打开 Coupang Eats（已登录并设好定位）。

2️⃣ 挑选美食 🍕🍜🥟
浏览附近餐厅，自由添加想吃的菜品，尽情混搭！

3️⃣ 拍下完整购物车截图 🖼️
在点击"支付"前，从头到尾滑动并截图
（大多数手机：电源键 + 音量下键 → "滚动截图"）。

4️⃣ 发送截图给礼宾服务聊天 💬
将图片发送到您的专属聊天窗口，我们会立即确认。

5️⃣ 由我们代付 💳✨
我们的团队会使用韩国本地信用卡帮您下单，
美食会直接送到您门口！

6️⃣ 退房时结算 💵
退房时以现金偿还即可。
也可使用银行卡或转账支付，但请注意这些方式会产生额外费用
（例如双重增值税或外国卡手续费）。
现金最简单也最划算！


*为什么要这样操作？*
韩国外卖应用要求本地实名验证，因此海外信用卡无法直接支付。
宾客专用手机可让您自由选餐，但无法用您自己的卡付款。
COZE 的本地信用卡相当于"友好的垫付"，我们只代为支付餐费，不会作为 COZE 的营业收入。

祝您用餐愉快，入住舒心！🍽️🏠😊`;

const FOOD_JA = `🍽️ *ゲスト用スマホでの注文ガイド*（Coupang Eats）

COZE Hospitality 3.0へようこそ！
韓国では海外発行のクレジットカードが使えない場合でも、お好きなお料理をラクに注文できます 😊👇


1️⃣ すでに設定済みのゲスト用スマホを手に取る 📱
Coupang Eats を開いてください（ログイン済み・位置情報設定済み）。

2️⃣ 食べたいものを選ぶ 🍕🍜🥟
近くのレストランを見ながら、好きなメニューを自由にカートへ追加してください。組み合わせも自由です！

3️⃣ カートの全体スクリーンショットを撮る 🖼️
「支払い」を押す前に、上から下までスクロールしながら全体をスクショしてください。
（多くのスマホ：電源ボタン＋音量下ボタン →「スクロールスクショ」）

4️⃣ コンシェルジュのチャットにスクショを送る 💬
専用チャットへ画像を送ってください。すぐに内容を確認します。

5️⃣ 私たちが立替で決済します 💳✨
当チームが韓国の国内クレジットカードで代わりに注文し、
お料理は玄関まで直接届きます！

6️⃣ チェックアウト時に精算 💵
チェックアウト時に現金でご精算ください。
カード決済や送金も可能ですが、追加手数料が発生する場合があります
（例：二重VAT、海外カード手数料など）。
現金がいちばん簡単でお得です！


*なぜこの方法なの？*
韓国のデリバリーアプリは本人認証が必要なため、海外カードでは直接支払えないことがあります。
ゲスト用スマホで自由に注文内容を選べますが、お支払いはお客様のカードでは完了できません。
COZEの国内カードは"親切な立替"として、私たちが決済のみを代行します。
※当サービスは料理代の立替のみで、COZEの売上として計上されるものではありません。

どうぞ美味しく、快適にお過ごしください 🍽️🏠😊
Gaya, Guest Care Team of COZE Hospitality 3.0`;

const VAN_EN = `🚕✨ *COZE 1-to-1 Taxi Matching — Big-Fam Transport* ✨🚕

Got a squad bigger than your group chat? 📱👨‍👩‍👧‍👦 Forget "taxi Tetris." With our 1-to-1 Taxi Matching Service your whole crew rolls together — smoothly, cheaply, and zero stress.

*💡 Why It's a Vibe*

💸 ₩0 service fee
Like, literally zero. Pay only what's on the meter — no cap.

🚐 Van-taxi + cab combos
Up to 7 seats per van, mixed with regular taxis so everyone (and every suitcase) has legroom.

🛵 Local rates
We haggle so you don't have to — same fare locals score.

🔔 Live updates
We slide into your chat with plate number & ETA the moment your ride's locked in.

*🕹️ How to Play*

🏠 Leaving home? Drop the destination. We'll spawn the perfect fleet.

📍 Out and about?
• Pop open Naver Map → turn on GPS → screenshot your pin.
• DM us the pic.
• Boom — ride confirmed, ETA incoming.

💳 Pay & go. Swipe any major card or tap that T-money. Done.

*Our pledge 🤝*
Seoul's transit maze shouldn't wreck family vibes. We fix it — totally free — so you focus on K-food hunts, palace pics, and TikTok memories.

COZE has your back. Travel happy, fam! 🎉`;

const VAN_JA = `🚕✨ *COZE 1-to-1 タクシーマッチング — 大家族・大人数移動* ✨🚕

グループが大きすぎて「タクシーパズル」状態…？🧩👨‍👩‍👧‍👦
もう大丈夫です😉 COZEの1-to-1 タクシーマッチングサービスなら、みんなでスムーズに移動できます。ストレスゼロでコスパも最高✨

*💡 ここが推しポイント*

💸 サービス料 ₩0
本当にゼロ。お支払いはメーター料金のみです。

🚐 バンタクシー＋一般タクシーの最適ミックス
バンは最大7人乗り。人数＆スーツケース量に合わせて、ぴったりの台数を組みます🧳

🛵 ローカル相場で安心
面倒な交渉はCOZEが対応。現地と同じレート感で手配します。

🔔 リアルタイム共有
手配完了したら、すぐにチャットで車両ナンバー＆到着予定(ETA)をお送りします📩

*🕹️ 使い方（超かんたん）*

🏠 宿から出発する時：目的地を送るだけ → ベストな車両編成で手配します✅

📍 外出先から呼ぶ時：
・Naver Mapを開く → GPSオン → 現在地のピンを表示📍
・その画面をスクショしてDM📸
・すぐに手配 → ETAお送りします✨

💳 支払い：主要クレジットカード / T-money などでOK（ドライバーに直接お支払い）

*🤝 COZEの約束*
ソウルの移動で家族のテンションを下げたくない！
無料でまとめて整えます。みなさんはK-フード、宮殿フォト、旅の思い出作りに集中してください📸🍜💛

COZEがしっかりサポートします。楽しく移動しましょう〜🎉
Gaya, Guest Care Team of COZE Hospitality 3.0`;

const VAN_ZH_CN = `🚕✨ *COZE 1对1 出租车匹配服务 — 大家庭/大团队出行* ✨🚕

人多到像"群聊人数"一样爆表？📱👨‍👩‍👧‍👦
别再玩"打车俄罗斯方块"了🧩 用COZE的1对1 出租车匹配，全员顺顺利利一起出发——省心、省钱、零压力✨

*💡 为什么超好用*

💸 服务费 ₩0
真的一分钱不收！只需支付计价器表上费用。

🚐 大巴型出租车＋普通出租车组合
每台Van Taxi最多7座。我们会根据人数＋行李量，搭配最合适的车辆组合🧳

🛵 按本地合理价格
你不用砍价，我们来处理，尽量按当地常规价格帮你安排。

🔔 实时更新
车辆确认后，我们会在聊天里第一时间发送车牌号＋预计到达时间(ETA)📩

*🕹️ 怎么用（超简单）*

🏠 从住宿出发：把目的地发给我们 → 我们会配好车辆数量并安排✅

📍 在外面叫车：
・打开Naver Map → 开启GPS → 显示你的位置📍
・截图定位画面发给我们📸
・立刻安排车辆 → 发送ETA✨

💳 付款方式：可刷主要信用卡 / T-money 等（直接付给司机即可）

*🤝 我们的承诺*
首尔交通不该影响家庭/朋友出行氛围💛
我们用完全免费的方式帮你搞定车队调度，你只需要专心吃美食、拍宫殿、留下旅行回忆📸🍜

COZE全程罩你～开心出行吧🎉
Gaya, Guest Care Team of COZE Hospitality 3.0`;

async function run() {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    const spreadsheetId = CONFIG.SHEET_ID;

    const header = ['key', 'EN', 'KR', 'JA', 'ZH-CN', 'ZH-TW'];
    const rows = [
        header,
        ['breakfast_tips', EN, KR, JA, ZH_CN, ''],
        ['guest_rules', RULES_EN, RULES_KR, RULES_JA, '', RULES_ZH_TW],
        ['food_tips', FOOD_EN, '', FOOD_JA, FOOD_ZH_CN, ''],
        ['van_tips', VAN_EN, '', VAN_JA, VAN_ZH_CN, ''],
    ];

    // Create tab if it doesn't exist
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

    // Formatting
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

    console.log(`✅ tips_messages populated: breakfast_tips, guest_rules, food_tips, van_tips`);
}

run().catch(e => {
    console.error('❌ Failed:', e?.message);
    process.exit(1);
});
