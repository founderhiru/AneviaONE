import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Card, ScreenContainer, StatusBadge, TextInput } from '../../components';
import { PRODUCT_TERMS } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { aiService } from '../../services/ai/aiService';
import type { ConversationMessage } from '../../types';

let messageCounter = 0;
function nextId() {
  messageCounter += 1;
  return `local-msg-${messageCounter}`;
}

export default function AskScreen() {
  const theme = useTheme();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    aiService.getSuggestedQuestions().then(setSuggestions);
  }, []);

  async function ask(question: string) {
    if (!question.trim() || asking) return;
    const userMessage: ConversationMessage = {
      id: nextId(),
      role: 'user',
      text: question,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAsking(true);

    let result: Awaited<ReturnType<typeof aiService.askQuestion>>;
    try {
      result = await aiService.askQuestion(question);
    } catch {
      result = { aiExplanation: { text: 'I couldn’t reach your records just now. Please try again.' } };
    }
    const newMessages: ConversationMessage[] = [];
    if (result.recordAnswer) {
      newMessages.push({
        id: nextId(),
        role: 'assistant',
        text: result.recordAnswer.text,
        source: 'record',
        evidence: result.recordAnswer.evidence,
        wordedByAi: result.recordAnswer.wordedByAi,
        createdAt: new Date().toISOString(),
      });
    }
    if (result.aiExplanation) {
      newMessages.push({
        id: nextId(),
        role: 'assistant',
        text: result.aiExplanation.text,
        source: 'ai_explanation',
        createdAt: new Date().toISOString(),
      });
    }
    setMessages((prev) => [...prev, ...newMessages]);
    setAsking(false);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }

  function MessageBubble({ message }: { message: ConversationMessage }) {
    const isUser = message.role === 'user';
    return (
      <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        <Card
          style={{
            maxWidth: '88%',
            backgroundColor: isUser ? theme.colors.brandPrimary : theme.colors.surface,
          }}
        >
          {!isUser && message.source ? (
            <View style={{ marginBottom: theme.spacing.xxs }}>
              <StatusBadge
                label={message.source === 'record' ? (message.wordedByAi ? 'From your records · worded by AI' : 'From your records') : 'AI explanation'}
                tone={message.source === 'record' ? 'accent' : 'neutral'}
              />
            </View>
          ) : null}
          <Text
            style={[
              theme.typography.bodyMedium,
              { color: isUser ? theme.colors.textOnDark : theme.colors.textPrimary },
            ]}
          >
            {message.text}
          </Text>
          {message.evidence?.length ? (
            <View style={{ marginTop: theme.spacing.xs, gap: theme.spacing.xxs }} testID="answer-sources">
              {message.evidence.slice(0, 4).map((e, i) => (
                <Pressable
                  key={`${e.documentId}-${e.pageNumber ?? 0}-${i}`}
                  onPress={() => router.push(`/documents/${e.documentId}`)}
                  accessibilityRole="link"
                  accessibilityLabel={`Source: ${e.documentTitle}${e.pageNumber ? `, page ${e.pageNumber}` : ''}`}
                >
                  <Text style={[theme.typography.caption, { color: theme.colors.brandPrimary }]}>
                    {e.documentTitle}
                    {e.pageNumber ? ` · page ${e.pageNumber}` : ''}
                  </Text>
                  {e.excerpt ? (
                    <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]} numberOfLines={2}>
                      “{e.excerpt}”
                    </Text>
                  ) : null}
                </Pressable>
              ))}
              {message.evidence.length > 4 ? (
                <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>+{message.evidence.length - 4} more sources</Text>
              ) : null}
            </View>
          ) : null}
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenContainer scroll={false} edges={['top', 'left', 'right']} contentStyle={{ flex: 1 }}>
        <View style={{ gap: 4, marginBottom: theme.spacing.sm }}>
          <Text style={[theme.typography.displayMedium, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            {PRODUCT_TERMS.askMyHealth}
          </Text>
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
            Understand your recorded health history. Answers come only from your reports — not diagnosis or treatment advice.
          </Text>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.md }}
          ListEmptyComponent={
            <View style={{ gap: theme.spacing.xs }}>
              {suggestions.map((q) => (
                <Pressable key={q} onPress={() => ask(q)} accessibilityRole="button">
                  <Card>
                    <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>{q}</Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          }
          renderItem={({ item }) => <MessageBubble message={item} />}
        />

        <View style={{ flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'flex-end', paddingTop: theme.spacing.xs }}>
          <View style={{ flex: 1 }}>
            <TextInput
              placeholder="Ask about your health..."
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => ask(input)}
              returnKeyType="send"
              accessibilityLabel="Ask about your health"
            />
          </View>
          <Pressable
            onPress={() => ask(input)}
            disabled={!input.trim() || asking}
            accessibilityRole="button"
            accessibilityLabel="Send question"
            style={{
              minHeight: theme.minTouchTarget,
              minWidth: theme.minTouchTarget,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.colors.brandPrimary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !input.trim() || asking ? 0.5 : 1,
            }}
          >
            <Text style={[theme.typography.labelLarge, { color: theme.colors.textOnDark }]}>Go</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}
