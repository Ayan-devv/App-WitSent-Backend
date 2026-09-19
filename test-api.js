const axios = require('axios');

async function test() {
  try {
    const loginRes = await axios.post('http://localhost:5000/api/login', {
      email: 'admin@example.com',
      password: 'Admin@1234'
    });
    
    const token = loginRes.data.token;
    console.log("Logged in successfully. Token acquired.");
    
    try {
      const res1 = await axios.get('http://localhost:5000/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      console.log("users status:", res1.status, res1.data.users ? `Got ${res1.data.users.length} users` : '');
    } catch(e) {
      console.error("users failed:", e.response ? e.response.data : e.message);
    }
    
    try {
      const res2 = await axios.get('http://localhost:5000/admin/activity-log', { headers: { Authorization: `Bearer ${token}` } });
      console.log("logs status:", res2.status, res2.data.logs ? `Got ${res2.data.logs.length} logs` : '');
    } catch(e) {
      console.error("logs failed:", e.response ? e.response.data : e.message);
    }

  } catch (error) {
    console.error("Login failed:", error.response ? error.response.data : error.message);
  }
}

test();
