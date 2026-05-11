import { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, ChevronDown, ChevronUp, Loader2, AlertCircle, Settings, Server } from 'lucide-react';
import { ChatMessage, LinkedEntity } from '../types';
import { useLLM } from '../contexts/LLMContext';

interface ChatPanelProps {
  noteText: string;
  entities: LinkedEntity[];
  annotations: Record<string, string>;
  onChat?: (messages: ChatMessage[], noteText: string, entities: LinkedEntity[], annotations: Record<string, string>) => Promise<string>;
}

export function ChatPanel({ noteText, entities, annotations, onChat }: ChatPanelProps) {
  const { settings, provider, openModal } = useLLM();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canChat = !!onChat || settings.isConfigured;
  const isViaBackend = !!onChat;

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading || !canChat) return;

    const userMessage: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: inputValue.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      let response: string;
      if (onChat) {
        response = await onChat([...messages, userMessage], noteText, entities, annotations);
      } else if (provider) {
        response = await provider.chat([...messages, userMessage], noteText, entities, annotations);
      } else {
        throw new Error('No chat provider available');
      }
      setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: response, timestamp: new Date() }]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response');
      setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: 'Sorry, I encountered an error connecting to the AI service.', timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (prompt: string) => { setInputValue(prompt); inputRef.current?.focus(); };

  const renderContent = (content: string) => {
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={idx}>{part.slice(2, -2)}</strong>;
      return part.split('\n').map((line, lineIdx) => (<span key={`${idx}-${lineIdx}`}>{lineIdx > 0 && <br />}{line}</span>));
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-indigo-500" />
          <span className="font-semibold text-slate-800">AI Assistant</span>
          {isViaBackend && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded">
              <Server className="w-2.5 h-2.5" />backend
            </span>
          )}
          {messages.length > 0 && <span className="text-xs text-slate-400">({messages.length} messages)</span>}
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {isExpanded && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[350px] border-t border-slate-100">
            {messages.length === 0 ? (
              <div className="text-center py-6">
                <MessageCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                {!canChat ? (
                  <>
                    <p className="text-sm text-slate-500 mb-3">Configure an LLM provider to enable chat</p>
                    <button onClick={openModal} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                      <Settings className="w-3.5 h-3.5" />Configure
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-500 mb-4">Ask me about this clinical note</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      <button onClick={() => handleQuickAction('Give me a summary of this note')} className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full hover:bg-indigo-100 transition-colors">Summary</button>
                      <button onClick={() => handleQuickAction('Which entities are ambiguous?')} className="text-xs px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full hover:bg-amber-100 transition-colors">Ambiguous?</button>
                      <button onClick={() => handleQuickAction('What entities still need review?')} className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full hover:bg-emerald-100 transition-colors">Pending</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                      {msg.role === 'assistant' ? <div className="prose prose-sm max-w-none">{renderContent(msg.content)}</div> : msg.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 rounded-xl px-3 py-2 text-sm text-slate-500 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {isViaBackend ? 'Calling /api/v1/discussion...' : 'Thinking...'}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {error && (
            <div className="px-4 py-2 bg-rose-50 border-t border-rose-100 flex items-center gap-2 text-xs text-rose-600">
              <AlertCircle className="w-3 h-3" />{error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-3 border-t border-slate-100">
            <div className="flex gap-2">
              <input ref={inputRef} type="text" value={inputValue} onChange={e => setInputValue(e.target.value)}
                placeholder={canChat ? 'Ask about this note...' : 'Configure LLM to enable chat'}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50"
                disabled={isLoading || !canChat} />
              <button type="submit" disabled={!inputValue.trim() || isLoading || !canChat}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
