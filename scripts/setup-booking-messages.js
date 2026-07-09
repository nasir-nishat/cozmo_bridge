// One-time script: creates the booking_messages tab in Google Sheets and populates it.
// Run: node scripts/setup-booking-messages.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/google-credentials.json'), 'utf-8'));
const { client_id, client_secret } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333');
oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/google-token.json'), 'utf-8')));

const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
const SHEET_ID = '1xzDlJ9LXIXAtz6qpJfRqlEK5Fvmok9sgEMgYVpQmpc0';

const ROWS = [
    ['key', 'text'],
    ['booking_confirmation_EN',
`Hi [$GUEST_NAME$]🎉

Thank you so much for choosing COZE Hospitality 3.0 for your stay in Seoul.

We're truly happy to welcome you, and we'll do our best to make your trip smooth, comfortable, and memorable.

To support you more personally, our AI host COZMO has created a private WhatsApp concierge channel for your stay.

COZMO and all of our COZE hosts are in that channel together. Through this channel, we'll share your house information, check-in guidance, local tips, and details about COZE's guest care services.

At COZE, our service is designed to go beyond a hotel — with personal, real-time care for your accommodation, transportation, food delivery, local apps, tours, and any small travel needs.

That's why communication through the messenger channel is essential to fully enjoy COZE's personalized service.

When you see the WhatsApp channel, could you please send us a quick "hello"? 😊

We'll be very happy to start preparing everything for you.

Warmly,
Guest Care Team I COZE Hospitality 3.0 Team`],

    ['booking_confirmation_JA',
`Hi [$GUEST_NAME$]🎉

この度は、ソウルでのご滞在に COZE Hospitality 3.0 をお選びいただき、誠にありがとうございます。

皆さまをお迎えできることを心より楽しみにしております。ご滞在が快適で、スムーズで、思い出深いものになるよう、私たちがしっかりサポートいたします。

よりパーソナルなサポートをご提供するため、COZE の AI Host「COZMO」が、お客様専用の WhatsApp コンシェルジュチャンネルを作成しました。

そのチャンネルには COZMO と COZE のホスト全員が参加しており、宿泊施設のご案内、チェックイン情報、周辺情報、そして COZE のサービスシステムについて詳しくご案内いたします。

COZE のサービスは、通常のホテルを超えたパーソナルケアを目指しています。交通、フードデリバリー、現地アプリ、ツアー、旅行中のちょっとしたお困りごとまで、できる限りお手伝いいたします。

そのため、COZE の個別サポートをしっかりご利用いただくには、メッセンジャーでのやり取りがとても大切です。

WhatsApp チャンネルをご確認いただけましたら、簡単に "hello" とご返信いただけますでしょうか？😊

皆さまのソウル滞在を心を込めて準備いたします。

Warmly,
Guest Care Team I COZE Hospitality 3.0 Team`],

    ['booking_confirmation_ZH',
`Hi [$GUEST_NAME$]🎉

非常感谢您选择 COZE Hospitality 3.0 作为您在首尔的住宿。

我们非常期待欢迎您的到来，也会尽力让您的旅程更加轻松、舒适、难忘。

为了给您提供更贴心的个人服务，我们的 AI Host "COZMO" 已经为您建立了专属的 WhatsApp 礼宾服务频道。

COZMO 和 COZE 的所有 Host 都会在这个频道中一起为您服务。我们会通过这里为您详细介绍住宿信息、入住指南、周边建议，以及 COZE 的各种客人服务系统。

COZE 提供的不只是住宿，而是超越一般酒店的个人定制服务。无论是交通、外卖、当地应用程序、旅游安排，还是旅行中的小问题，我们都会尽力协助您。

因此，如果想完整体验 COZE 的个性化服务，通过这个 WhatsApp 频道保持联系非常重要。

当您看到这个 WhatsApp 频道时，可以请您简单回复一句 "hello" 吗？😊

我们会很高兴为您的首尔之旅提前做好准备。

Warmly,
Guest Care Team I COZE Hospitality 3.0 Team`],

    ['booking_confirmation_KO',
`[$GUEST_FIRST_NAME$]님 안녕하세요 🎉

서울에서의 소중한 숙박을 COZE Hospitality 3.0과 함께해 주셔서 진심으로 감사드립니다 😊

저희는 [$GUEST_FIRST_NAME$]님을 만나 뵙게 되어 정말 기쁘고, 이번 서울 여행이 편안하고 즐겁고 오래 기억에 남는 시간이 될 수 있도록 정성껏 도와드리겠습니다.

[$GUEST_FIRST_NAME$]님께 더 빠르고 세심한 도움을 드리기 위해, 저희 AI 호스트 COZMO가 전용 카카오톡 컨시어지 채팅방을 만들어두었습니다 🤖💛

이 채팅방에는 COZMO와 COZE의 게스트 케어 호스트들이 함께 참여하고 있어요.

앞으로 이곳에서 숙소 안내, 체크인 정보, 주변 맛집과 로컬 팁, 교통, 음식 배달, 투어, 현지 앱 사용 등 여행 중 필요한 다양한 도움을 편하게 받아보실 수 있습니다.

함께 여행하시는 가족이나 친구분들도 이 채팅방에 초대해 주시면, 예약자분이 중요한 정보를 다시 전달해야 하는 번거로움을 줄일 수 있어 훨씬 편리합니다 😊

특히 실제 숙박하실 멤버분들은 함께 참여해 주시면 좋고, 차량을 이용하시는 경우에는 주차 안내가 필요할 수 있으니 운전하시는 분은 꼭 채팅방에 함께 참여 부탁드립니다 🚗

COZE의 서비스는 단순한 숙박을 넘어, [$GUEST_NAME$]님의 서울 여행 전체가 더 쉽고 즐거워질 수 있도록 함께하는 올인원 케어 서비스입니다 ✨

카카오톡 채팅방을 확인하시면 간단히 "안녕하세요"라고 인사 한마디만 남겨주시겠어요? 😊

그 순간부터 저희가 [$GUEST_NAME$]님의 여행을 위해 하나씩 기쁘게 준비해드리겠습니다.

Gaya, guest care team
COZE Hospitality 3.0`],
];

async function main() {
    // Create the tab
    try {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: { requests: [{ addSheet: { properties: { title: 'booking_messages' } } }] },
        });
        console.log('✅ Tab created: booking_messages');
    } catch (e) {
        if (e.message?.includes('already exists')) {
            console.log('ℹ️ Tab already exists — updating rows');
        } else {
            throw e;
        }
    }

    // Write rows
    await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: 'booking_messages!A1:B5',
        valueInputOption: 'RAW',
        requestBody: { values: ROWS },
    });
    console.log('✅ Rows written — booking_messages tab is ready');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
