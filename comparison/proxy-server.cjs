const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Proxy for AWS Lambda (Model 1)
app.post('/api/model1', async (req, res) => {
    try {
        const response = await fetch('https://a3ysspj2mgd7ckhcd5tpfltomu0tmskk.lambda-url.ap-south-1.on.aws/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Proxy for KNN (Model 2)
app.post('/api/model2', async (req, res) => {
    try {
        const response = await fetch('https://2f249c8be5b7.ngrok-free.app/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Proxy for Transformer (Model 3)
app.post('/api/model3', async (req, res) => {
    try {
        const response = await fetch('https://2f249c8be5b7.ngrok-free.app/predict_transformer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 CORS Proxy running on http://localhost:${PORT}`);
});
