# Skill: guest-note

## Purpose

Monitor WhatsApp group messages for guest amenity requests and save them to Hostfully notes automatically.

## Trigger

Detect messages that contain amenity requests such as:

- stroller, 유모차
- crib, 아기 침대
- extra towel, 수건
- iron, 다리미
- hair dryer, 드라이기
- oven, 오븐
- chair, 의자
- fan, 선풍기
- heater, 히터
- baby chair, 아기 의자
- extension cord, 멀티탭

## Cancelled Request

If guest says they no longer need it:

- "never mind", "cancel", "괜찮아요", "취소", "안해도 돼요"
- Append "CANCELLED" to the note

## Action

When a request is detected:

1. Get the WhatsApp group ID
2. POST to <http://localhost:3001/guest/note>

```json
   {
     "group_id": "{{group_id}}",
     "note": "Amenity request: {{item}}"
   }
```

## Cancelled Action

POST to <http://localhost:3001/guest/note>

```json
{
  "group_id": "{{group_id}}",
  "note": "CANCELLED: {{item}} request cancelled at {{time}}"
}
```

## Link Command

When any member types `/link <uid>` in the group:

1. Extract the UID
2. POST to <http://localhost:3001/link>

```json
   {
     "group_id": "{{group_id}}",
     "lead_uid": "{{uid}}"
   }
```

## Rules

- Silent in group — never reply
- Save all requests including casual mentions
- Save staff requests too
- If multiple items in one message → save each separately
- All notifications go to Telegram only
