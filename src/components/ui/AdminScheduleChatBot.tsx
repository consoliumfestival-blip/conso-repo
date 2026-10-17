import { ui } from '@/constants/designSystem';
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  useWindowDimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ShieldAlert,
  MessageSquare,
  X,
  Send,
  Lock,
  Unlock,
  ShieldCheck,
  Database,
  Calendar,
  Mic,
  MicOff,
  Volume2
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { getAdminReadOnlyAgentResponse } from '../../services/adminReadOnlyAgentService';

interface AdminChatBotProps {
  tenantId?: string | null;
  festivalId?: string | null;
  schedules?: any[];
  venues?: any[];
  registrations?: any[];
  results?: any[];
  judges?: any[];
  workflowStatuses?: any[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function AdminScheduleChatBot({ tenantId, festivalId, schedules = [], venues = [], registrations = [], results = [], judges = [], workflowStatuses = [] }: AdminChatBotProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [isOpen, setIsOpen] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Welcome to the Admin Portal Assistant. I have read-only access to this tenant\'s operational data. I can also read public schedules and published results for the active festival. I cannot modify data or access another tenant\'s private data.\n\n[OPTION:How many events are scheduled?|Events Count] [OPTION:Show me unpublished results|Results Status]',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const recognitionRef = useRef<any>(null);

  const isMobile = windowWidth <= 1024;
  const isTablet = windowWidth >= 768;

  const dStyles = {
    headerTitle: { fontSize: isTablet ? 18 : 14.5 },
    headerSubtitle: { fontSize: isTablet ? 12 : 10 },
    messageText: { fontSize: isTablet ? 15 : 12.5, lineHeight: isTablet ? 22 : 18 },
    messageTime: { fontSize: isTablet ? 10.5 : 8.5 },
    chipText: { fontSize: isTablet ? 12 : 10 },
    inlineChipText: { fontSize: isTablet ? 13 : 11 },
    textInput: { fontSize: isTablet ? 15 : 12.5 },
  };

  const triggerHaptic = () => {
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, messages]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const toggleVoice = () => {
    if (Platform.OS !== 'web') {
      alert('Voice assistant is currently only supported on the website.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support voice input.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    triggerHaptic();
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // Using English since Admin is mostly English
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setInputValue(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const speakText = async (text: string) => {
    if (Platform.OS !== 'web') return;
    triggerHaptic();
    let cleanText = text.replace(/\[OPTION:.*?\]/g, '').replace(/[*#_~`]/g, '').trim();

    const fallbackTTS = (fallbackText: string) => {
      const synth = (window as any).speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(fallbackText);
      utterance.lang = 'en-IN';
      synth.speak(utterance);
    };

    if ((window as any)._currentAudio) {
      (window as any)._currentAudio.pause();
    }
    
    // Using fallback TTS directly for the admin bot to avoid external dependencies
    fallbackTTS(cleanText);
  };

  const handleSend = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    triggerHaptic();
    setInputValue('');
    setIsLoading(true);

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    const lowerInput = trimmed.toLowerCase();
    let response = null;

    if (tenantId) {
      try {
        // Build Local Analytics Context from Props
        const marksSubmittedCount = workflowStatuses.filter(s => s.marks_completed).length;
        const publishedCount = results.filter(r => r.published === true || r.result_status === 'published').length;
        
        const contextData = {
          total_schedules: schedules.length,
          total_venues: venues.length,
          total_judges: judges.length,
          total_registrations: registrations.length,
          marks_submitted_events: marksSubmittedCount,
          results_published: publishedCount,
          results_unpublished_but_marked: marksSubmittedCount - publishedCount
        };

        const systemInstruction = `You are a highly secure, read-only Admin Assistant for a Festival Management System.
CRITICAL SAFETY RULES:
1. You act as a plugin. You do not modify existing options or break any frontend UI.
2. ALWAYS reply in the language the user asks (Malayalam, English, or Manglish).
3. Distinguish between "marks submitted" (marks_submitted_events) and "results published" (results_published). Do not confuse them. 

Context Data:
${JSON.stringify(contextData, null, 2)}`;

        // Connect to Gemini Cloud AI directly from Frontend
        const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
        if (geminiKey) {
          try {
            // Lazy load the generative AI package to keep initial bundle size small
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(geminiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction });
            
            const result = await model.generateContent(`User Question:\n${trimmed}`);
            response = result.response.text();
          } catch (err) {
            console.warn('Gemini Cloud API Error:', err);
          }
        } else {
          console.warn('EXPO_PUBLIC_GEMINI_API_KEY is missing. Add it to .env.local to use Gemini Cloud AI.');
        }
      } catch (err) {
        console.warn('AI context preparation error:', err);
      }
    }

    if (!response && tenantId) {
      response = await getAdminReadOnlyAgentResponse(trimmed, { tenantId, festivalId });
    }

    if (!response) {
      response = "I am a secure Admin Assistant. I can tell you about total schedules, venues, participants, judges, or results. This chat is read-only and tenant-scoped.";
    }
    
    if (!tenantId && lowerInput.match(/(judg|judj|vidhiyal|jedge)/)) {
      if (lowerInput.match(/(list|name|peru|ethoke|ethokke|aar|arellam|arellaman)/)) {
        response = `The registered judges are: ${judges.map(j => j.name).join(', ')}.`;
      } else {
        response = `There are a total of ${judges.length} judges registered in the system.\n\n[OPTION:Who are they?|List Judges]`;
      }
    } else if (!tenantId && lowerInput.match(/(schedule|event|pari|program)/)) {
      response = `There are currently ${schedules.length} scheduled events in the system.\n\n[OPTION:Show me venues|View Venues]`;
    } else if (!tenantId && lowerInput.match(/(venue|vedhi|stage)/)) {
      if (lowerInput.match(/(list|name|peru|ethoke|ethokke)/)) {
        response = `The configured venues are: ${venues.map(v => v.name).join(', ')}.`;
      } else {
        response = `There are ${venues.length} venues configured.\n\n[OPTION:List venue names|List Venues]`;
      }
    } else if (!tenantId && lowerInput.match(/(participant|registration|student|piller|alukar|candidate|cantidate|profile|prophile)/)) {
      const isSearch = lowerInput.match(/(profile|prophile|candidate|cantidate|search|find|details|about)/);
      const searchName = trimmed.replace(/(profile|prophile|candidate|cantidate|participant|registration|student|piller|alukar|show|me|the|of|for|about|details|search|find|ok|who|is)/gi, '').trim().toLowerCase();
      
      if (isSearch && searchName.length > 2) {
        const foundRegs = registrations.filter(r => 
          r.participants?.name?.toLowerCase().includes(searchName) || 
          r.participants?.chest_number?.toLowerCase().includes(searchName)
        );
        
        if (foundRegs.length > 0) {
          const p = foundRegs[0].participants;
          const events = Array.from(new Set(foundRegs.map(r => r.items?.item_name_en).filter(Boolean))).join(', ');
          response = `🧑‍🎓 Candidate Profile:\nName: ${p?.name}\nChest No: ${p?.chest_number || 'N/A'}\nEvents: ${events || 'None'}`;
        } else {
          response = `I couldn't find any candidate matching "${searchName}".`;
        }
      } else {
        response = `There are ${registrations.length} total registrations across all events. To search for a specific profile, type their name followed by "profile".`;
      }
    } else if (!tenantId && lowerInput.match(/(result|publish|winner|phalam|jeyicha)/)) {
      const published = results.filter(r => r.published === true || r.result_status === 'published').length;
      const unpublished = results.length - published;
      response = `Out of ${results.length} total results, ${published} are published and ${unpublished} are unpublished.\n\n[OPTION:What about schedules?|Check Schedules]`;
    }

    setTimeout(() => {
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      if (isVoiceEnabled) {
        speakText(response);
      }
      setIsLoading(false);
      scrollToBottom();
    }, 600);
  };

  const toggleChat = () => {
    triggerHaptic();
    setIsOpen(!isOpen);
  };

  const quickActionChips = [
    { label: 'Event Stats', icon: <Calendar size={12} color="#818CF8" />, query: 'How many events are scheduled?' },
    { label: 'System Results', icon: <Database size={12} color="#34D399" />, query: 'Show me unpublished results' },
    { label: 'Registrations', icon: <ShieldCheck size={12} color="#FBBF24" />, query: 'How many participants registered?' },
  ];

  return (
    <View style={styles.container} pointerEvents="box-none">
      {!isOpen && (
        <TouchableOpacity activeOpacity={0.85} onPress={toggleChat} style={styles.floatingButton}>
          <LinearGradient
            colors={['#818CF8', '#4F46E5', '#312E81']}
            locations={[0, 0.5, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.floatingButtonGradient}
          >
            <View style={styles.floatingIconWrapper}>
              <ShieldAlert size={24} color={ui.colors.surface} />
              <View style={styles.sparkleIcon}>
                <Lock size={10} color="#FBBF24" />
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {isOpen && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.chatPanel,
            isMobile
              ? { top: 0, bottom: 0, left: 0, right: 0, width: '100%', height: '100%', borderRadius: 0, borderWidth: 0 }
              : { width: 420, height: Math.min(650, windowHeight - 60), bottom: 30, right: 30 },
          ]}
        >
          <View style={styles.panelInner}>
            <LinearGradient
              colors={['rgba(79, 70, 229, 0.15)', 'rgba(3, 15, 30, 0.6)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.panelHeader}
            >
              <View style={styles.headerTitleRow}>
                <View style={styles.aiBadgeGlow}>
                  <ShieldCheck size={16} color="#818CF8" />
                </View>
                <View>
                  <Text style={[styles.headerTitle, dStyles.headerTitle]}>Admin Portal Bot</Text>
                  <Text style={[styles.headerSubtitle, dStyles.headerSubtitle]}>Restricted Access • Internal Data</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setIsVoiceEnabled(!isVoiceEnabled)}
                  style={[styles.closeButton, { backgroundColor: isVoiceEnabled ? 'rgba(79,70,229,0.3)' : 'rgba(255,255,255,0.06)' }]}
                  activeOpacity={0.8}
                >
                  <Volume2 size={16} color={isVoiceEnabled ? '#818CF8' : 'rgba(255,255,255,0.4)'} />
                </TouchableOpacity>
                <TouchableOpacity onPress={toggleChat} style={styles.closeButton} activeOpacity={0.8}>
                  <X size={18} color="rgba(255, 255, 255, 0.6)" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            <ScrollView ref={scrollViewRef} style={styles.messageScroll} contentContainerStyle={styles.messageScrollContent}>
                  {messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    let cleanText = msg.content;
                    const options: { query: string; label: string }[] = [];
                    
                    if (!isUser) {
                      const parts = msg.content.split(/(\[OPTION:.*?\|.*?\])/);
                      const textParts = parts.map((part) => {
                        const match = part.match(/\[OPTION:(.*?)\|(.*?)\]/);
                        if (match) {
                          options.push({ query: match[1], label: match[2] });
                          return '';
                        }
                        return part;
                      });
                      cleanText = textParts.join('').trim();
                    }

                    return (
                      <View key={msg.id} style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAi]}>
                        {!isUser && (
                          <View style={styles.botIconWrapper}>
                            <ShieldCheck size={10} color="#818CF8" />
                          </View>
                        )}
                        <LinearGradient
                          colors={isUser ? ['#4F46E5', '#3730A3'] : ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.04)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[styles.messageBubble, isUser ? styles.messageBubbleUser : styles.messageBubbleAi]}
                        >
                          <Text style={[styles.messageText, isUser ? styles.messageTextUser : styles.messageTextAi, dStyles.messageText]}>
                            {cleanText}
                          </Text>
                          {options.length > 0 && (
                            <View style={styles.inlineChipsContainer}>
                              {options.map((opt, i) => (
                                <TouchableOpacity key={i} onPress={() => handleSend(opt.query)} style={styles.inlineChipButton}>
                                  <Text style={[styles.inlineChipText, dStyles.inlineChipText]}>{opt.label}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                          <Text style={[styles.messageTime, dStyles.messageTime]}>
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </LinearGradient>
                      </View>
                    );
                  })}
                </ScrollView>

                <View style={styles.chipsOuterContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={styles.chipsContainer}>
                    {quickActionChips.map((chip, idx) => (
                      <TouchableOpacity key={idx} activeOpacity={0.8} onPress={() => handleSend(chip.query)} style={styles.chipButton}>
                        {chip.icon}
                        <Text style={[styles.chipText, dStyles.chipText]}>{chip.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.inputContainer}>
                  <TouchableOpacity onPress={toggleVoice} style={[styles.voiceButton, isListening && styles.voiceButtonActive]}>
                    {isListening ? <MicOff size={18} color="#EF4444" /> : <Mic size={18} color="rgba(255, 255, 255, 0.7)" />}
                  </TouchableOpacity>
                  <TextInput
                    value={inputValue}
                    onChangeText={setInputValue}
                    placeholder="Ask about portal data..."
                    placeholderTextColor="rgba(255, 255, 255, 0.35)"
                    style={[styles.textInput, dStyles.textInput]}
                    onSubmitEditing={() => handleSend(inputValue)}
                    {...Platform.select({ web: { outlineStyle: 'none' as any }, default: {} })}
                  />
                  <TouchableOpacity
                    onPress={() => handleSend(inputValue)}
                    disabled={!inputValue.trim()}
                    style={[styles.sendButton, !inputValue.trim() && styles.sendButtonDisabled]}
                  >
                    <Send size={16} color={ui.colors.surface} />
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, justifyContent: 'flex-end', alignItems: 'flex-end' },
  floatingButton: { position: 'absolute', bottom: 24, right: 24, width: 64, height: 64, borderRadius: 32, elevation: 12, shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, shadowOpacity: 0.6, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.3)', overflow: 'hidden' },
  floatingButtonGradient: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  floatingIconWrapper: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  sparkleIcon: { position: 'absolute', top: -6, right: -6, backgroundColor: '#031E19', borderRadius: 8, padding: 1.5, borderWidth: 1, borderColor: 'rgba(251, 191, 36, 0.4)' },
  chatPanel: { position: 'absolute', bottom: 24, right: 24, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(79, 70, 229, 0.3)', backgroundColor: 'rgba(3, 10, 24, 0.95)', overflow: 'hidden', elevation: 12, shadowColor: ui.shadow.shadowColor, shadowOffset: { width: 0, height: 10 }, shadowRadius: 30, shadowOpacity: 0.8 },
  panelInner: { flex: 1, flexDirection: 'column' },
  panelHeader: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiBadgeGlow: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(79, 70, 229, 0.2)', borderWidth: 1, borderColor: 'rgba(79, 70, 229, 0.4)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Poppins_700Bold', color: ui.colors.surface, fontSize: 14.5 },
  headerSubtitle: { fontFamily: 'Poppins_400Regular', color: 'rgba(255, 255, 255, 0.45)', fontSize: 10, marginTop: 0.5 },
  closeButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255, 255, 255, 0.05)', alignItems: 'center', justifyContent: 'center' },
  passwordScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lockIconContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(79, 70, 229, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(79, 70, 229, 0.3)' },
  passwordTitle: { fontFamily: 'Poppins_700Bold', color: ui.colors.surface, fontSize: 20, marginBottom: 8 },
  passwordSubtitle: { fontFamily: 'Poppins_400Regular', color: 'rgba(255, 255, 255, 0.5)', fontSize: 12, textAlign: 'center', marginBottom: 32 },
  passwordInputWrapper: { width: '100%', marginBottom: 20 },
  passwordInput: { width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.15)', borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontFamily: 'Poppins_400Regular', color: ui.colors.surface, fontSize: 14 },
  errorTextSmall: { fontFamily: 'Poppins_400Regular', color: '#F87171', fontSize: 11, marginTop: 6, marginLeft: 4 },
  unlockBtn: { width: '100%', backgroundColor: '#4F46E5', paddingVertical: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 4 },
  unlockBtnText: { fontFamily: 'Poppins_700Bold', color: ui.colors.surface, fontSize: 14 },
  messageScroll: { flex: 1 },
  messageScrollContent: { padding: 16, gap: 16 },
  messageRow: { flexDirection: 'row', gap: 8, maxWidth: '85%' },
  messageRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  messageRowAi: { alignSelf: 'flex-start' },
  botIconWrapper: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(79, 70, 229, 0.2)', borderWidth: 1, borderColor: 'rgba(79, 70, 229, 0.4)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  messageBubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1, flexShrink: 1 },
  messageBubbleUser: { borderColor: 'rgba(255, 255, 255, 0.15)', borderTopRightRadius: 2 },
  messageBubbleAi: { borderColor: 'rgba(255, 255, 255, 0.1)', borderTopLeftRadius: 2 },
  messageText: { fontFamily: 'Poppins_400Regular', fontSize: 12.5, lineHeight: 18 },
  messageTextUser: { color: ui.colors.surface },
  messageTextAi: { color: 'rgba(255, 255, 255, 0.95)' },
  messageTime: { fontFamily: 'Poppins_400Regular', color: 'rgba(255, 255, 255, 0.4)', fontSize: 8.5, alignSelf: 'flex-end', marginTop: 6 },
  chipsOuterContainer: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.05)', backgroundColor: 'rgba(3, 10, 24, 0.6)' },
  chipsContainer: { paddingHorizontal: 16, gap: 8 },
  chipButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.15)', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 32 },
  chipText: { fontFamily: 'Poppins_700Bold', color: 'rgba(255, 255, 255, 0.8)', fontSize: 10 },
  inlineChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 4 },
  inlineChipButton: { backgroundColor: 'rgba(79, 70, 229, 0.2)', borderColor: 'rgba(79, 70, 229, 0.4)', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  inlineChipText: { fontFamily: 'Poppins_700Bold', color: '#818CF8', fontSize: 11 },
  inputContainer: { flexDirection: 'row', padding: 12, backgroundColor: 'rgba(3, 10, 24, 0.95)', borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.08)', alignItems: 'center', gap: 10 },
  voiceButton: { padding: 10, marginRight: 2, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  voiceButtonActive: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  textInput: { flex: 1, height: 42, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: 'Poppins_400Regular', color: ui.colors.surface, fontSize: 13 },
  sendButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center', elevation: 2 },
  sendButtonDisabled: { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
});
