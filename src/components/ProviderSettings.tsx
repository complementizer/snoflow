import { useState } from 'react';
import { X, Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useLLM, LLMSettings } from '../contexts/LLMContext';
import { LLMProviderType } from '../types';

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export function ProviderSettings() {
  const { settings, updateSettings, isModalOpen, closeModal, provider } = useLLM();
  const [local, setLocal] = useState<LLMSettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');

  if (!isModalOpen) return null;

  const handleSave = () => {
    updateSettings(local);
    closeModal();
  };

  const handleTest = async () => {
    updateSettings(local);
    setTestStatus('testing');
    await new Promise(r => setTimeout(r, 100));
    try {
      const ok = await provider?.testConnection();
      setTestStatus(ok ? 'success' : 'error');
    } catch {
      setTestStatus('error');
    }
  };

  const currentKey = local.provider === 'openai' ? local.openaiKey : local.azureKey;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">LLM Provider Settings</h2>
          <button onClick={closeModal} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Provider</label>
            <select value={local.provider} onChange={e => setLocal({ ...local, provider: e.target.value as LLMProviderType })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="openai">OpenAI</option>
              <option value="azure-openai">Azure OpenAI</option>
            </select>
          </div>

          {local.provider === 'openai' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">API Key</label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={local.openaiKey} onChange={e => setLocal({ ...local, openaiKey: e.target.value })}
                    placeholder="sk-..." className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Model</label>
                <select value={local.openaiModel} onChange={e => setLocal({ ...local, openaiModel: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="gpt-4o-mini">gpt-4o-mini (fast, cheap)</option>
                  <option value="gpt-4o">gpt-4o (best quality)</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Endpoint</label>
                <input type="text" value={local.azureEndpoint} onChange={e => setLocal({ ...local, azureEndpoint: e.target.value })}
                  placeholder="https://your-resource.openai.azure.com" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">API Key</label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={local.azureKey} onChange={e => setLocal({ ...local, azureKey: e.target.value })}
                    placeholder="Azure API key" className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Deployment Name</label>
                <input type="text" value={local.azureDeployment} onChange={e => setLocal({ ...local, azureDeployment: e.target.value })}
                  placeholder="gpt-4o" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </>
          )}

          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
            API keys are stored in your browser's localStorage and never sent to any server besides the LLM provider.
          </div>

          {testStatus === 'success' && <div className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle className="w-4 h-4" />Connection successful!</div>}
          {testStatus === 'error' && <div className="flex items-center gap-2 text-sm text-rose-600"><AlertCircle className="w-4 h-4" />Connection failed. Check your credentials.</div>}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button onClick={handleTest} disabled={!currentKey || testStatus === 'testing'}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-2">
            {testStatus === 'testing' && <Loader2 className="w-4 h-4 animate-spin" />}
            Test Connection
          </button>
          <div className="flex gap-2">
            <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
