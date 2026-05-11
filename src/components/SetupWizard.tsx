import { useState } from 'react';
import { Activity, Cloud, Server, ChevronRight, ChevronLeft, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { ResolverMode, LLMProviderType } from '../types';
import { AppConfig, loadConfig, saveConfig, needsLLM } from '../config';

interface SetupWizardProps {
  onComplete: (config: AppConfig) => void;
}

type Step = 'mode' | 'llm' | 'test';

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  const [step, setStep] = useState<Step>('mode');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const modes: Array<{ value: ResolverMode; title: string; desc: string; icon: React.ReactNode }> = [
    {
      value: 'snowstorm',
      title: 'LLM + Snowstorm',
      desc: 'Uses an LLM to extract entities, then searches the public SNOMED Snowstorm API for concept candidates. Best quality with full hierarchy support.',
      icon: <Cloud className="w-6 h-6" />,
    },
    {
      value: 'custom-backend',
      title: 'Custom Backend',
      desc: 'Connect to your own entity linking backend (e.g. GLiNER + KRISSBERT). Full control over the pipeline.',
      icon: <Server className="w-6 h-6" />,
    },
  ];

  const handleModeSelect = (mode: ResolverMode) => {
    setConfig(prev => ({ ...prev, resolverMode: mode }));
  };

  const handleNext = () => {
    if (step === 'mode') {
      if (config.resolverMode === 'custom-backend') {
        setStep('test');
      } else {
        setStep('llm');
      }
    } else if (step === 'llm') {
      setStep('test');
    }
  };

  const handleBack = () => {
    setTestResult('idle');
    setTestMessage('');
    if (step === 'test') {
      if (config.resolverMode === 'custom-backend') setStep('mode');
      else setStep('llm');
    } else if (step === 'llm') {
      setStep('mode');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult('idle');
    setTestMessage('');

    try {
      if (config.resolverMode === 'custom-backend') {
        const resp = await fetch(`${config.customBackendUrl}/api/v1/health`, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          setTestResult('success');
          setTestMessage('Backend is reachable and healthy.');
        } else {
          setTestResult('error');
          setTestMessage(`Backend returned HTTP ${resp.status}`);
        }
      } else if (needsLLM(config.resolverMode)) {
        if (config.llmProvider === 'openai') {
          const resp = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${config.openai.apiKey}` },
            signal: AbortSignal.timeout(10000),
          });
          if (resp.ok) {
            setTestResult('success');
            setTestMessage('OpenAI API key is valid.');
          } else {
            setTestResult('error');
            setTestMessage(`OpenAI returned HTTP ${resp.status}. Check your API key.`);
          }
        } else {
          const url = `${config.azure.endpoint}/openai/deployments/${config.azure.deploymentName}/chat/completions?api-version=${config.azure.apiVersion}`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': config.azure.apiKey },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }], max_tokens: 1 }),
            signal: AbortSignal.timeout(15000),
          });
          if (resp.ok) {
            setTestResult('success');
            setTestMessage('Azure OpenAI connection successful.');
          } else {
            setTestResult('error');
            const body = await resp.text().catch(() => '');
            setTestMessage(`Azure returned HTTP ${resp.status}. ${body.slice(0, 100)}`);
          }
        }
      }
    } catch (err) {
      setTestResult('error');
      setTestMessage(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setTesting(false);
    }
  };

  const handleFinish = () => {
    const final = { ...config, setupComplete: true };
    saveConfig(final);
    onComplete(final);
  };

  const canProceedFromLLM = () => {
    if (config.llmProvider === 'openai') return !!config.openai.apiKey;
    return !!(config.azure.apiKey && config.azure.endpoint && config.azure.deploymentName);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div className="flex items-center gap-3">
            <Activity className="w-7 h-7 text-white" />
            <h1 className="text-xl font-bold text-white">SNOMED CT Annotator</h1>
          </div>
          <p className="text-blue-100 text-sm mt-1">Configure your setup to get started</p>
          <div className="flex gap-2 mt-4">
            {(['mode', 'llm', 'test'] as Step[]).map((s, i) => {
              const isActive = s === step;
              const isPast = (['mode', 'llm', 'test'] as Step[]).indexOf(step) > i;
              if (s === 'llm' && config.resolverMode === 'custom-backend') return null;
              return (
                <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${isActive ? 'bg-white' : isPast ? 'bg-white/60' : 'bg-white/20'}`} />
              );
            })}
          </div>
        </div>

        <div className="p-8">
          {step === 'mode' && (
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Choose your mode</h2>
              <p className="text-sm text-slate-500 mb-6">How should entities be extracted and linked to SNOMED CT?</p>
              <div className="space-y-3">
                {modes.map(mode => (
                  <button
                    key={mode.value}
                    onClick={() => handleModeSelect(mode.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      config.resolverMode === mode.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${config.resolverMode === mode.value ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                        {mode.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{mode.title}</span>
                          {mode.value === 'snowstorm' && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">Recommended</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-1">{mode.desc}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 ${
                        config.resolverMode === mode.value ? 'border-blue-500' : 'border-slate-300'
                      }`}>
                        {config.resolverMode === mode.value && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {config.resolverMode === 'custom-backend' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Backend URL</label>
                  <input
                    type="text"
                    value={config.customBackendUrl}
                    onChange={e => setConfig(prev => ({ ...prev, customBackendUrl: e.target.value }))}
                    placeholder="http://localhost:8000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>
          )}

          {step === 'llm' && (
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Configure LLM Provider</h2>
              <p className="text-sm text-slate-500 mb-6">Set up your AI provider for entity extraction and analysis.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Provider</label>
                  <select
                    value={config.llmProvider}
                    onChange={e => setConfig(prev => ({ ...prev, llmProvider: e.target.value as LLMProviderType }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="azure-openai">Azure OpenAI</option>
                  </select>
                </div>

                {config.llmProvider === 'openai' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">API Key</label>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={config.openai.apiKey}
                          onChange={e => setConfig(prev => ({ ...prev, openai: { ...prev.openai, apiKey: e.target.value } }))}
                          placeholder="sk-..."
                          className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Model</label>
                      <select
                        value={config.openai.model}
                        onChange={e => setConfig(prev => ({ ...prev, openai: { ...prev.openai, model: e.target.value } }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
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
                      <input
                        type="text"
                        value={config.azure.endpoint}
                        onChange={e => setConfig(prev => ({ ...prev, azure: { ...prev.azure, endpoint: e.target.value } }))}
                        placeholder="https://your-resource.openai.azure.com"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">API Key</label>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={config.azure.apiKey}
                          onChange={e => setConfig(prev => ({ ...prev, azure: { ...prev.azure, apiKey: e.target.value } }))}
                          placeholder="Azure API key"
                          className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Deployment Name</label>
                      <input
                        type="text"
                        value={config.azure.deploymentName}
                        onChange={e => setConfig(prev => ({ ...prev, azure: { ...prev.azure, deploymentName: e.target.value } }))}
                        placeholder="gpt-4o"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </>
                )}

                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
                  API keys are stored in your browser's localStorage and never sent to any server besides the LLM provider.
                </div>
              </div>
            </div>
          )}

          {step === 'test' && (
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Test Connection</h2>
              <p className="text-sm text-slate-500 mb-6">Verify everything is set up correctly before starting.</p>

              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-slate-700 mb-2">Configuration Summary</h3>
                  <div className="space-y-1 text-sm text-slate-600">
                    <div><span className="text-slate-400">Mode:</span> {modes.find(m => m.value === config.resolverMode)?.title}</div>
                    {needsLLM(config.resolverMode) && (
                      <div><span className="text-slate-400">LLM:</span> {config.llmProvider === 'openai' ? `OpenAI (${config.openai.model})` : 'Azure OpenAI'}</div>
                    )}
                    {config.resolverMode === 'custom-backend' && (
                      <div><span className="text-slate-400">Backend:</span> {config.customBackendUrl}</div>
                    )}
                    {config.resolverMode === 'snowstorm' && (
                      <div><span className="text-slate-400">Snowstorm:</span> Public API (browser.ihtsdotools.org)</div>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {testing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Testing...</>
                  ) : (
                    'Test Connection'
                  )}
                </button>

                {testResult === 'success' && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />{testMessage}
                  </div>
                )}
                {testResult === 'error' && (
                  <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />{testMessage}
                  </div>
                )}

                <p className="text-xs text-slate-400 text-center">
                  You can skip the test and configure later from the settings menu.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-8 py-4 border-t border-slate-200 bg-slate-50">
          {step !== 'mode' ? (
            <button onClick={handleBack} className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4" />Back
            </button>
          ) : (
            <div />
          )}
          {step === 'test' ? (
            <button onClick={handleFinish} className="flex items-center gap-1 px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
              Get Started<ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={step === 'llm' && !canProceedFromLLM()}
              className="flex items-center gap-1 px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg transition-colors"
            >
              Next<ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
