# Skill: hostfully-booking

When I receive a booking payload with these fields:
- guestFirstName
- guestLastName
- guestPhone
- checkIn
- checkOut
- propertyName
- guestNationality

Do the following steps in order:

1. Create a WhatsApp group named "COZE | {guestFirstName} {guestLastName} | {propertyName}"
2. Add {guestPhone} and +821097802701 to the group
3. Read coze-welcome-style.md for tone and style guidance
4. Generate a personalized welcome message in the language matching {guestNationality}
5. Send the welcome message to the WhatsApp group