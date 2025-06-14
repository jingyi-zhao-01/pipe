import axios from 'axios';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '../.env' }); // or simply dotenv.config();

const TOKEN_PATH = './fitbit_tokens.json';
const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET } = process.env;

const getAuthHeader = () =>
  'Basic ' + Buffer.from(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`).toString('base64');

async function refreshAccessToken(refreshToken) {
  try {
    const response = await axios.post(
      'https://api.fitbit.com/oauth2/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      {
        headers: {
          Authorization: getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    await fs.writeJson(TOKEN_PATH, response.data, { spaces: 2 });
    return response.data.access_token;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
}

async function getAccessToken() {
  const tokens = await fs.readJson(TOKEN_PATH);
  return await refreshAccessToken(tokens.refresh_token);
}

async function fetchHeartRateData(accessToken, date) {
  const url = `https://api.fitbit.com/1/user/-/activities/heart/date/${date}/1d/1min.json?timezone=UTC`;

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data['activities-heart']?.dataset || [];
}

async function saveCSV(date, data) {
  const filename = `heart_rate_${date}.csv`;
  const csv = 'Time,HeartRate\n' + data.map(d => `${d.time},${d.value}`).join('\n');
  await fs.writeFile(filename, csv);
  console.log(`✅ Saved ${data.length} records to ${filename}`);
}

const run = async () => {
  try {
    const accessToken = await getAccessToken();

    const today = new Date();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    for (let i = 0; i < 7; i++) {
      const date = new Date(today.getTime() - i * MS_PER_DAY);
      const yyyyMMdd = date.toISOString().split('T')[0];

      console.log(`📅 Fetching heart rate for ${yyyyMMdd}...`);

      const heartData = await fetchHeartRateData(accessToken, yyyyMMdd);

      if (heartData.length > 0) {
        await saveCSV(yyyyMMdd, heartData);
      } else {
        console.log(`⚠️ No heart rate data for ${yyyyMMdd}`);
      }
    }

    console.log('✅ Finished exporting 7-day heart rate data.');
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
  }
};

run();
