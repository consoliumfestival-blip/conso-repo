import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../../../core/config/supabase';
import { Key, Plus, Pause, Play, Trash2 } from 'lucide-react-native';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/shadcn/card';
import { Button } from '../../../components/ui/shadcn/button';
import { Input } from '../../../components/ui/shadcn/input';
import { Label } from '../../../components/ui/shadcn/label';

type Provider = 'gemini' | 'llama' | 'openai' | 'anthropic';

interface ApiKey {
  id: string;
  provider: Provider;
  key_value: string;
  is_active: boolean;
  created_at: string;
}

export default function ApiKeysSettingsScreen() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<Provider>('gemini');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('system_api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching API keys:', error);
    } else {
      setApiKeys(data || []);
    }
    setLoading(false);
  };

  const handleAddKey = async () => {
    if (!newKey.trim()) {
      Alert.alert('Error', 'Please enter an API Key');
      return;
    }

    setIsAdding(true);
    const { error } = await supabase
      .from('system_api_keys')
      .insert([{ provider: selectedProvider, key_value: newKey.trim(), is_active: true }]);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setNewKey('');
      fetchApiKeys();
      Alert.alert('Success', 'API Key added successfully');
    }
    setIsAdding(false);
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('system_api_keys')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      fetchApiKeys();
    }
  };

  const deleteKey = async (id: string) => {
    Alert.alert(
      'Delete Key',
      'Are you sure you want to delete this API Key?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('system_api_keys').delete().eq('id', id);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              fetchApiKeys();
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      {/* Page Title */}
      <View className="mb-6">
        <Text className="text-3xl font-poppins-black text-ui-text">API Keys</Text>
        <Text className="text-sm font-poppins text-ui-text-muted mt-1">Manage AI provider keys</Text>
      </View>

      {/* Add New Key */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <Text className="font-poppins-bold text-ui-text text-base mb-4">Add New API Key</Text>

          <Label className="mb-2">Select Provider</Label>
          <View className="flex-row gap-2 mb-4">
            {(['gemini', 'openai', 'anthropic'] as Provider[]).map(provider => (
              <Button
                key={provider}
                variant={selectedProvider === provider ? 'default' : 'outline'}
                size="sm"
                onPress={() => setSelectedProvider(provider)}
              >
                {provider}
              </Button>
            ))}
          </View>

          <View className="mb-4">
            <Label>API Key</Label>
            <Input
              placeholder={`Enter your ${selectedProvider.toUpperCase()} API Key`}
              value={newKey}
              onChangeText={setNewKey}
              secureTextEntry
            />
          </View>

          <Button onPress={handleAddKey} disabled={isAdding}>
            {isAdding ? 'Saving...' : 'Save Key'}
          </Button>
        </CardContent>
      </Card>

      {/* Active Keys */}
      <Text className="font-poppins-bold text-ui-text text-lg mb-3">Manage Active Keys</Text>

      {loading ? (
        <ActivityIndicator color="#0F766E" style={{ marginTop: 40 }} />
      ) : apiKeys.length === 0 ? (
        <Card>
          <CardContent className="p-6 items-center">
            <Key size={40} color="#CBD5E1" />
            <Text className="font-poppins text-ui-text-muted mt-3 text-center">
              No API Keys found. The system is using fallback .env keys.
            </Text>
          </CardContent>
        </Card>
      ) : (
        apiKeys.map((key) => (
          <Card key={key.id} className="mb-3">
            <CardContent className="p-4 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <View className="flex-row items-center mb-1">
                  <Text className="font-poppins-bold text-ui-text text-base capitalize">
                    {key.provider === 'llama' ? 'Llama (Groq)' : key.provider}
                  </Text>
                  <View className={`ml-2 px-2 py-0.5 rounded ${key.is_active ? 'bg-green-100' : 'bg-ui-muted'}`}>
                    <Text className={`font-poppins-bold text-[10px] ${key.is_active ? 'text-green-700' : 'text-ui-text-muted'}`}>
                      {key.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </Text>
                  </View>
                </View>
                <Text className="font-poppins text-ui-text-muted text-xs" numberOfLines={1}>
                  {key.key_value.substring(0, 8)}••••••••{key.key_value.substring(key.key_value.length - 4)}
                </Text>
              </View>

              <View className="flex-row gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => toggleStatus(key.id, key.is_active)}
                >
                  {key.is_active ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => deleteKey(key.id)}
                >
                  Delete
                </Button>
              </View>
            </CardContent>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
