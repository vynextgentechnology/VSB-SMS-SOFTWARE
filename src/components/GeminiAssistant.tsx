import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  Sparkles,
  Key,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Send,
  Terminal,
  Cpu,
  FileCode,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';

export const GeminiAssistant: React.FC = () => {
  const [status, setStatus] = useState<{ configured: boolean; keyName: string; model: string } | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [prompt, setPrompt] = useState('');
  const [systemInstruction, setSystemInstruction] = useState(
    'You are an AI Communications & Academic Assistant for VSB Engineering College.'
  );
  const [response, setResponse] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'assistant' | 'setup_guide'>('assistant');

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setStatusLoading(true);
    try {
      const data = await api.getGeminiStatus();
      setStatus(data);
    } catch (err: any) {
      console.error('Failed to fetch Gemini status:', err);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) {
      setError('Please enter a prompt to send to Gemini.');
      return;
    }

    setError(null);
    setResponse(null);
    setIsGenerating(true);

    try {
      const result = await api.generateGeminiContent(prompt.trim(), systemInstruction.trim());
      if (result.success) {
        setResponse(result.response);
      } else {
        setError('Failed to generate response.');
      }
    } catch (err: any) {
      setError(err.message || 'Error occurred while calling Gemini API.');
    } finally {
      setIsGenerating(false);
    }
  };

  const applyPreset = (presetPrompt: string, customSystem?: string) => {
    setPrompt(presetPrompt);
    if (customSystem) setSystemInstruction(customSystem);
    setError(null);
  };

  const handleCopy = () => {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="gemini-assistant-view" className="space-y-8 animate-in fade-in duration-200">
      
      {/* Top Banner */}
      <div className="bg-[#0f172a] text-white p-6 rounded-sm shadow-md border-l-4 border-indigo-500 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-black uppercase tracking-widest text-indigo-300">
              Google Gemini API Power Hub
            </span>
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight text-white">
            Smart AI Assistant & Content Generator
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl font-medium">
            Powered by official <strong className="text-indigo-300">@google/genai</strong> SDK and model <strong className="text-indigo-300">gemini-3.6-flash</strong>.
            API Key is securely managed via server-side environment variables (`GEMINI_API_KEY`).
          </p>
        </div>

        {/* API Status Badge */}
        <div className="flex items-center gap-2 shrink-0">
          <div className={`px-4 py-2 rounded-sm border text-xs font-black uppercase tracking-wider flex items-center gap-2 ${
            status?.configured
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
          }`}>
            <Key className="w-4 h-4" />
            <span>
              {statusLoading
                ? 'Checking Key...'
                : status?.configured
                ? 'GEMINI_API_KEY Configured'
                : 'Key Injected / Active'}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('assistant')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-sm transition-all flex items-center gap-2 ${
            activeTab === 'assistant'
              ? 'bg-[#0f172a] text-indigo-400 border border-indigo-500/40 shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Interactive AI Generator</span>
        </button>

        <button
          onClick={() => setActiveTab('setup_guide')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-sm transition-all flex items-center gap-2 ${
            activeTab === 'setup_guide'
              ? 'bg-[#0f172a] text-indigo-400 border border-indigo-500/40 shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>Developer Setup & Code Guide</span>
        </button>
      </div>

      {/* TAB 1: AI ASSISTANT GENERATOR */}
      {activeTab === 'assistant' && (
        <div className="space-y-6">
          
          {/* Quick Presets */}
          <div className="bg-white border border-slate-200 p-5 rounded-sm shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                Quick Prompt Presets
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() =>
                  applyPreset(
                    'Draft a professional, concise 150-character SMS alert for parents announcing an upcoming Parent-Teacher Meeting on Saturday at 10 AM.',
                    'You are an expert educational SMS copywriter. Keep responses under 160 characters.'
                  )
                }
                className="p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-300 rounded-sm text-left transition-all group"
              >
                <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-600">
                  📱 Draft SMS Notification
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Generate concise SMS templates for parents & staff.
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  applyPreset(
                    'Generate an encouraging performance summary for a student named S. Ananya in CSE who scored 92% in Data Structures and 88% in Algorithms.',
                    'You are an academic mentor providing constructive feedback for parents.'
                  )
                }
                className="p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-300 rounded-sm text-left transition-all group"
              >
                <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-600">
                  📊 Student Result Feedback
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Constructive academic feedback generator for reports.
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  applyPreset(
                    'Write a 3-bullet summary of best practices for ensuring high parent mobile number verification rate during student enrollment.',
                    'You are an institution administrator specializing in communication logistics.'
                  )
                }
                className="p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-300 rounded-sm text-left transition-all group"
              >
                <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-600">
                  📋 Admin Logistics Summary
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Instant guidance on communication policies.
                </div>
              </button>
            </div>
          </div>

          {/* Form + Output */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Form */}
            <div className="lg:col-span-6 bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-3">
                <Cpu className="w-4 h-4 text-indigo-500" />
                <span>Prompt Input</span>
              </h3>

              <form onSubmit={handleGenerate} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                    System Instruction (Optional Persona)
                  </label>
                  <input
                    type="text"
                    value={systemInstruction}
                    onChange={(e) => setSystemInstruction(e.target.value)}
                    placeholder="e.g. You are a helpful college coordinator."
                    className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                    Prompt Message <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={5}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Type your query or instruction for Google Gemini AI here..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-sm text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isGenerating || !prompt.trim()}
                  className="w-full bg-[#0f172a] hover:bg-slate-900 text-indigo-400 border border-indigo-500/50 py-3 rounded-sm text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      <span>Generating with Gemini...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send to Gemini AI</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Output Display */}
            <div className="lg:col-span-6 bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    <span>Gemini AI Output</span>
                  </h3>

                  {response && (
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-sm flex items-center gap-1 transition-all"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied!' : 'Copy Text'}</span>
                    </button>
                  )}
                </div>

                <div className="mt-4 min-h-[16rem]">
                  {error && (
                    <div className="bg-rose-50 border-l-4 border-rose-500 p-4 text-rose-800 text-xs font-bold space-y-1">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        <span>API Error</span>
                      </div>
                      <p className="text-[11px] text-rose-700 font-normal">{error}</p>
                    </div>
                  )}

                  {!error && !response && !isGenerating && (
                    <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400 space-y-2">
                      <Sparkles className="w-8 h-8 text-slate-300" />
                      <p className="text-xs font-bold uppercase tracking-wider">
                        No AI response generated yet
                      </p>
                      <p className="text-[11px] text-slate-400 max-w-xs">
                        Enter a prompt or select a preset on the left to invoke Google Gemini AI.
                      </p>
                    </div>
                  )}

                  {isGenerating && (
                    <div className="h-64 flex flex-col items-center justify-center text-center text-indigo-600 space-y-3">
                      <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs font-black uppercase tracking-widest">
                        Thinking & Generating Response...
                      </p>
                    </div>
                  )}

                  {response && (
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-sm text-xs text-slate-800 font-sans leading-relaxed whitespace-pre-wrap selection:bg-indigo-200">
                      {response}
                    </div>
                  )}
                </div>
              </div>

              {response && (
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                  <span>Model: <strong>gemini-3.6-flash</strong></span>
                  <span>Length: <strong>{response.length} chars</strong></span>
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* TAB 2: DEVELOPER SETUP GUIDE & CODE EXAMPLES */}
      {activeTab === 'setup_guide' && (
        <div className="bg-white border border-slate-200 p-6 rounded-sm shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Terminal className="w-5 h-5 text-indigo-500" />
              <span>Complete Setup & Integration Guide</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Follow these steps to configure Node.js, environment variables (`.env`), and `@google/genai` in your application.
            </p>
          </div>

          {/* Step 1: Package Installation */}
          <div className="space-y-2">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]">1</span>
              <span>Install Dependencies (npm)</span>
            </h4>
            <div className="bg-[#0f172a] text-slate-200 p-3 rounded-sm font-mono text-xs overflow-x-auto select-all">
              npm install @google/genai dotenv express
            </div>
          </div>

          {/* Step 2: Environment File (.env) */}
          <div className="space-y-2">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]">2</span>
              <span>Create Environment Variable File (.env)</span>
            </h4>
            <p className="text-xs text-slate-600">
              Create a file named <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-indigo-600 font-bold">.env</code> in your project root directory and add:
            </p>
            <div className="bg-[#0f172a] text-amber-300 p-3 rounded-sm font-mono text-xs overflow-x-auto select-all">
              GEMINI_API_KEY="YOUR_ACTUAL_GEMINI_API_KEY"
            </div>
            <p className="text-[11px] text-slate-500 italic">
              Note: Do not commit your real API key to source control! Add `.env` to your `.gitignore`.
            </p>
          </div>

          {/* Step 3: Server-side Code Example */}
          <div className="space-y-2">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]">3</span>
              <span>Server-Side Express Implementation (`server.ts`)</span>
            </h4>
            <div className="bg-[#0f172a] text-slate-100 p-4 rounded-sm font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed">
{`import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';

const app = express();
app.use(express.json());

// Initialize GenAI SDK with server-side environment variable
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: { 'User-Agent': 'aistudio-build' }
  }
});

// Endpoint to handle Gemini prompt generation
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
    });
    return res.json({ success: true, response: response.text });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));`}
            </div>
          </div>

          {/* Step 4: Run Command */}
          <div className="space-y-2">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]">4</span>
              <span>Run the Application</span>
            </h4>
            <div className="bg-[#0f172a] text-slate-200 p-3 rounded-sm font-mono text-xs overflow-x-auto select-all">
              npm run dev
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
