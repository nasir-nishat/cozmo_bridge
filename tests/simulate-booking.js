const axios = require('axios');

axios.post('http://localhost:3001/webhook', {
    event_type: 'NEW_INQUIRY',
    lead_uid: 'TEST_LEAD',
    property_uid: 'TEST_PROPERTY'
})
    .then(res => console.log('✅ Sent:', res.data))
    .catch(err => console.error('❌ Error:', err.message));