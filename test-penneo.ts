import { config } from './src/config/index.js';
import { getApiKeysToken } from './src/api/services/oauth.service.js';
import axios from 'axios';

(async () => {
  try {
    console.log("Fetching API Keys Token...");
    const tokenData = await getApiKeysToken();
    console.log("Token Data:", tokenData);
    
    if (tokenData && tokenData.access_token) {
        console.log("Token parts:", tokenData.access_token.split('.').length);
        
        console.log("Attempting to hit API casefiles endpoint...");
        const res = await axios.get(`${config.penneo.apiBaseUrl}/casefiles`, {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
                Accept: 'application/json'
            }
        });
        console.log("API Response Success:", res.status);
    }
  } catch (err) {
      if (err.response) {
          console.error("API Error Response:", err.response.status, err.response.data);
      } else {
          console.error("Error:", err.message);
      }
  }
})();
