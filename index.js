const express = require('express');
const fetch = require('node-fetch');
const FormData = require('form-data');

// Get your API key from environment variable (set it in DigitalOcean)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Basic sanity check: stop if no key found
if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable not set.');
  process.exit(1);
}

const app = express();

// We'll accept JSON bodies
app.use(express.json());

// Simple health check
app.get('/', (req, res) => {
  res.send('OK - Whisper transcription server up and running!');
});

// Main endpoint for transcription
app.post('/transcribe', async (req, res) => {
  try {
    // 1) Expect JSON like { "fileUrl": "https://..." }
    const { fileUrl } = req.body;
    if (!fileUrl) {
      return res.status(400).json({ error: 'Missing "fileUrl" in request body.' });
    }

    // 2) Fetch the audio file as a buffer
    const audioResponse = await fetch(fileUrl);
    if (!audioResponse.ok) {
      return res.status(400).json({ 
        error: 'Failed to download audio from the provided URL.',
        details: await audioResponse.text()
      });
    }
    const audioBuffer = await audioResponse.buffer();

    // 3) Build form data for Whisper
    const formData = new FormData();
    formData.append('model', 'whisper-1');
    formData.append('file', audioBuffer, { filename: 'audio.mp3' });

    // 4) Send to OpenAI
    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    // 5) Grab response
    const responseText = await whisperResponse.text();
    if (!whisperResponse.ok) {
      // If the response is not 2xx, include the raw text
      return res.status(whisperResponse.status).json({
        error: 'OpenAI returned an error',
        status: whisperResponse.status,
        raw_response: responseText
      });
    }

    // 6) Parse the JSON
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (err) {
      return res.status(500).json({
        error: 'Failed to parse JSON from OpenAI',
        raw_response: responseText
      });
    }

    // 7) Return the transcription
    return res.status(200).json({
      transcript: result.text,
      full_response: result
    });

  } catch (error) {
    console.error('Error in /transcribe:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Start server on port from environment or 8080
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
