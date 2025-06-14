import * as dotenv from 'dotenv';
import axios from 'axios';
import readline from 'readline';
import fs from 'fs-extra';

dotenv.config({ path: '../.env' }); // or simply dotenv.config();

const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI } = process.env;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const authUrl = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${FITBIT_CLIENT_ID}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=heartrate%20activity%20profile`;

console.log('🔑 Open this URL and authorize the app:\n');
console.log(authUrl + '\n');

rl.question('Paste the "code" from the redirect URL here: ', async code => {
  const basicAuth = Buffer.from(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`).toString('base64');

  try {
    const response = await axios.post(
      'https://api.fitbit.com/oauth2/token',
      new URLSearchParams({
        client_id: FITBIT_CLIENT_ID,
        grant_type: 'authorization_code',
        redirect_uri: FITBIT_REDIRECT_URI,
        code: code.trim(),
      }).toString(),
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const tokens = response.data;
    await fs.writeJson('./fitbit_tokens.json', tokens, { spaces: 2 });
    console.log('\n✅ Tokens saved to fitbit_tokens.json');
  } catch (err) {
    console.error('❌ Token exchange failed:', err.response?.data || err.message);
  } finally {
    rl.close();
  }
});
