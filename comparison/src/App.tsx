import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { supabase } from './supabaseClient';

// Emotion colors
const EMOTION_COLORS: Record<string, string> = {
  joy: '#d4af37',
  anger: '#ef4444',
  fear: '#8b5cf6',
  sadness: '#3b82f6',
  love: '#ec4899',
  unknown: '#6b7280',
};

interface EmotionPrediction {
  label: string;
  score: number;
  raw_scores?: {
    joy: number;
    sadness: number;
    anger: number;
    fear: number;
    love: number;
    unknown: number;
  };
}

interface RedditPost {
  id: string;
  text: string;
  meta: {
    subreddit: string;
  };
}

interface ModelPrediction {
  modelName: string;
  prediction: EmotionPrediction | null;
  loading: boolean;
  error: string | null;
}

async function getEmotionPrediction(text: string, endpoint: string, modelIndex: number): Promise<EmotionPrediction> {
  // For KNN and Transformer APIs (Models 2 & 3), add threshold parameter
  const body = (modelIndex === 1 || modelIndex === 2)
    ? { text, threshold: 0.5 }
    : { text };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  // Handle KNN API multi-label format
  if (data.emotions && data.probabilities) {
    // Convert multi-label to single label (pick highest probability)
    const emotions = Object.keys(data.probabilities);
    const topEmotion = emotions.reduce((prev, curr) =>
      data.probabilities[curr] > data.probabilities[prev] ? curr : prev
    );

    return {
      label: topEmotion,
      score: data.probabilities[topEmotion],
      raw_scores: {
        joy: data.probabilities.joy || 0,
        sadness: data.probabilities.sadness || 0,
        anger: data.probabilities.anger || 0,
        fear: data.probabilities.fear || 0,
        love: data.probabilities.love || 0,
        unknown: data.probabilities.unknown || 0
      }
    };
  }

  // Return AWS Lambda format as-is
  return data;
}

export default function App() {
  const [post, setPost] = useState<RedditPost | null>(null);
  const [customText, setCustomText] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [models, setModels] = useState<ModelPrediction[]>([
    { modelName: 'Model 1 (AWS Lambda)', prediction: null, loading: false, error: null },
    { modelName: 'Model 2 (KNN)', prediction: null, loading: false, error: null },
    { modelName: 'Model 3 (Transformer)', prediction: null, loading: false, error: null }
  ]);
  const [loading, setLoading] = useState(false);

  const endpoints = [
    import.meta.env.VITE_MODEL_1_ENDPOINT,
    import.meta.env.VITE_MODEL_2_ENDPOINT,
    import.meta.env.VITE_MODEL_3_ENDPOINT
  ];

  const fetchRandomPost = async () => {
    try {
      setLoading(true);
      setLoading(true);
      setIsCustomMode(false);
      setSelectedModel(null);
      setFeedbackSubmitted(false);
      const { data, error } = await supabase
        .from('reddit_posts')
        .select('*')
        .limit(100);

      if (error) throw error;

      if (data && data.length > 0) {
        const randomPost = data[Math.floor(Math.random() * data.length)];
        setPost({
          id: randomPost.post_id,
          text: randomPost.text,
          meta: { subreddit: randomPost.subreddit }
        });
      }
    } catch (error) {
      console.error('Error fetching post:', error);
    } finally {
      setLoading(false);
    }
  };

  const analyzeCustomText = () => {
    if (!customText.trim()) return;

    setIsCustomMode(true);
    setSelectedModel(null);
    setFeedbackSubmitted(false);
    setPost({
      id: 'custom',
      text: customText,
      meta: { subreddit: 'custom-input' }
    });
  };

  const submitFeedback = async (modelId: string) => {
    if (!post || feedbackSubmitted) return;

    try {
      const feedback = {
        text: post.text,
        selected_model: modelId,
        model1_prediction: models[0].prediction?.label || null,
        model2_prediction: models[1].prediction?.label || null,
        model3_prediction: models[2].prediction?.label || null,
        is_custom_text: isCustomMode
      };

      await supabase.from('model_feedback').insert(feedback);
      setSelectedModel(modelId);
      setFeedbackSubmitted(true);
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const getPredictions = async () => {
    if (!post) return;

    const updatedModels = [...models];

    for (let i = 0; i < endpoints.length; i++) {
      updatedModels[i] = { ...updatedModels[i], loading: true, error: null };
      setModels([...updatedModels]);

      try {
        if (endpoints[i].includes('PLACEHOLDER')) {
          throw new Error('Endpoint not configured');
        }

        const prediction = await getEmotionPrediction(post.text, endpoints[i], i);
        updatedModels[i] = { ...updatedModels[i], prediction, loading: false };
      } catch (error) {
        updatedModels[i] = {
          ...updatedModels[i],
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch prediction'
        };
      }

      setModels([...updatedModels]);
    }
  };

  useEffect(() => {
    fetchRandomPost();
  }, []);

  useEffect(() => {
    if (post) {
      getPredictions();
    }
  }, [post]);

  // Prepare chart data
  const chartData = models
    .filter(m => m.prediction)
    .map(m => ({
      model: m.modelName.split(' ')[0] + ' ' + m.modelName.split(' ')[1],
      [m.prediction!.label]: 100
    }));

  const distributionData = models[0]?.prediction?.raw_scores
    ? Object.entries(models[0].prediction.raw_scores).map(([emotion, score]) => {
      const model2Score = models[1]?.prediction?.raw_scores?.[emotion as keyof EmotionPrediction['raw_scores']] || 0;
      const model3Score = models[2]?.prediction?.raw_scores?.[emotion as keyof EmotionPrediction['raw_scores']] || 0;

      return {
        emotion,
        Model1: score * 100,
        Model2: model2Score * 100,
        Model3: model3Score * 100
      };
    })
    : [];

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <h1><TrendingUp size={28} style={{ display: 'inline', marginRight: '10px' }} />Model Comparison Dashboard</h1>
        </div>
        <button onClick={fetchRandomPost} disabled={loading}>
          <RefreshCw size={18} style={{ marginRight: '8px', display: 'inline' }} />
          {loading ? 'Loading...' : 'New Post'}
        </button>
      </header>

      {/* Custom Text Input */}
      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>Custom Text Analysis</h3>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Enter your own text to analyze..."
            style={{
              flex: 1,
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--reddit-border)',
              backgroundColor: 'rgba(0,0,0,0.3)',
              color: 'var(--reddit-text)',
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: '80px'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                analyzeCustomText();
              }
            }}
          />
          <button onClick={analyzeCustomText} disabled={!customText.trim()}>
            Analyze
          </button>
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--reddit-text-muted)', marginTop: '0.5rem' }}>
          Tip: Press Ctrl+Enter to analyze
        </p>
      </div>

      {post && (
        <div className="glass-card post-text">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <strong>r/{post.meta.subreddit}</strong>
            {isCustomMode && (
              <span style={{
                fontSize: '0.75rem',
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                backgroundColor: 'var(--reddit-orange)',
                color: 'white',
                fontWeight: '600'
              }}>
                Custom Input
              </span>
            )}
          </div>
          {post.text}
        </div>
      )}

      <div className="grid grid-3" style={{ marginTop: '2rem' }}>
        {models.map((model, idx) => (
          <div key={idx} className="glass-card model-card">
            <div className="model-header">
              <span className="model-name">{model.modelName}</span>
            </div>

            {model.loading && (
              <div className="loader">
                <div className="spinner"></div>
                <span>Analyzing...</span>
              </div>
            )}

            {model.error && (
              <div style={{ color: '#ef4444', padding: '1rem' }}>
                ⚠️ {model.error}
              </div>
            )}

            {model.prediction && !model.loading && (
              <>
                <div className="prediction" style={{ color: EMOTION_COLORS[model.prediction.label] }}>
                  {model.prediction.label}
                </div>
                <div className="confidence">
                  Confidence: {(model.prediction.score * 100).toFixed(1)}%
                </div>

                {/* Voting Button */}
                <button
                  onClick={() => submitFeedback(`model${idx + 1}`)}
                  disabled={feedbackSubmitted}
                  style={{
                    width: '100%',
                    marginTop: '1rem',
                    padding: '0.5rem',
                    fontSize: '0.9rem',
                    background: selectedModel === `model${idx + 1}`
                      ? '#00c853'
                      : feedbackSubmitted
                        ? 'rgba(255,255,255,0.1)'
                        : 'rgba(255,255,255,0.1)',
                    color: selectedModel === `model${idx + 1}` ? 'white' : 'var(--reddit-text)',
                    border: selectedModel === `model${idx + 1}`
                      ? 'none'
                      : '1px solid var(--glass-border)'
                  }}
                >
                  {selectedModel === `model${idx + 1}`
                    ? 'Selected Best Model'
                    : 'Vote as Best Model'}
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {distributionData.length > 0 && (
        <div className="glass-card" style={{ marginTop: '2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Emotion Distribution Comparison</h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#343536" />
                <XAxis dataKey="emotion" stroke="#818384" />
                <YAxis stroke="#818384" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1b',
                    border: '1px solid #343536',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar dataKey="Model1" fill="#ff4500" />
                <Bar dataKey="Model2" fill="#00c853" />
                <Bar dataKey="Model3" fill="#2196f3" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
