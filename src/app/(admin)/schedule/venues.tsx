import { ui } from '@/constants/designSystem';
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { useSchedule } from '../../../core/hooks/useSchedule';
import { ArrowLeft, Trash2, MapPin, Edit3, Plus } from 'lucide-react-native';

export default function VenuesManagement() {
  const router = useRouter();
  const goBack = useGoBack('/(admin)/schedule');
  const { venues, isLoadingVenues, createVenue, updateVenue, deleteVenue, isCreatingVenue, isUpdatingVenue, isDeletingVenue } = useSchedule();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [locationStr, setLocationStr] = useState('');

  const resetForm = () => {
    setName('');
    setCapacity('');
    setLocationStr('');
    setEditingId(null);
    setIsModalOpen(false);
  };

  const openEdit = (venue: any) => {
    setName(venue.name);
    setCapacity(venue.capacity ? venue.capacity.toString() : '');
    setLocationStr(venue.location || '');
    setEditingId(venue.id);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Error', 'Venue name is required');
    
    try {
      const payload = {
        name,
        capacity: capacity ? parseInt(capacity) : null,
        location: locationStr || null
      };

      if (editingId) {
        await updateVenue({ id: editingId, payload });
      } else {
        await createVenue(payload);
      }
      resetForm();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmMsg = 'Are you sure you want to delete this venue?';

    if (Platform.OS === 'web') {
      if (!window.confirm(confirmMsg)) return;
      try {
        await deleteVenue(id);
      } catch (err: any) {
        window.alert('❌ Error: ' + err.message);
      }
    } else {
      Alert.alert('Confirm Delete', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVenue(id);
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]);
    }
  };

  if (isLoadingVenues) return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 40 }} />;

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-3 px-3">
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-ssf-surface rounded-full">
            <ArrowLeft size={24} color={ui.colors.text} />
          </TouchableOpacity>
          <Text className="text-2xl font-poppins-black text-ssf-text">Venues</Text>
        </View>
        <TouchableOpacity 
          onPress={() => { resetForm(); setIsModalOpen(true); }}
          className="bg-ssf-primary px-4 py-2 rounded-xl flex-row items-center gap-x-2"
        >
          <Plus size={16} color={ui.colors.surface} />
          <Text className="font-poppins-bold text-white">Add Venue</Text>
        </TouchableOpacity>
      </View>

      {venues.length === 0 ? (
        <SsfCard className="items-center py-10">
          <MapPin size={48} color={ui.colors.border} className="mb-4" />
          <Text className="font-poppins text-ssf-text-muted">No venues created yet.</Text>
        </SsfCard>
      ) : (
        <View className="gap-y-4">
          {venues.map((venue: any) => (
            <SsfCard key={venue.id} className="flex-row justify-between items-center p-4">
              <View className="flex-1">
                <Text className="font-poppins-bold text-lg">{venue.name}</Text>
                <Text className="font-poppins text-sm text-ssf-text-muted">
                  Capacity: {venue.capacity || 'N/A'} • {venue.location || 'No location set'}
                </Text>
              </View>
              <View className="flex-row gap-x-2">
                <TouchableOpacity onPress={() => openEdit(venue)} className="p-2 bg-gray-50 rounded-full">
                  <Edit3 size={18} color="#4B5563" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(venue.id)} className="p-2 bg-red-50 rounded-full">
                  <Trash2 size={18} color="#DC2626" />
                </TouchableOpacity>
              </View>
            </SsfCard>
          ))}
        </View>
      )}

      {isModalOpen && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 50, padding: 20 }}>
          <View style={{ backgroundColor: ui.colors.surface, borderRadius: 16, width: '100%', maxWidth: 400, padding: 24 }}>
            <Text className="font-poppins-bold text-lg mb-4 text-ssf-text">
              {editingId ? 'Edit Venue' : 'Add Venue'}
            </Text>
            
            <View className="gap-y-4 mb-6">
              <View>
                <Text className="font-poppins text-xs text-ssf-text-muted mb-1">Venue Name *</Text>
                <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={name} onChangeText={setName} placeholder="e.g. Stage 1 (Main)" />
              </View>
              <View>
                <Text className="font-poppins text-xs text-ssf-text-muted mb-1">Capacity</Text>
                <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={capacity} onChangeText={setCapacity} keyboardType="numeric" placeholder="e.g. 500" />
              </View>
              <View>
                <Text className="font-poppins text-xs text-ssf-text-muted mb-1">Location Details</Text>
                <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={locationStr} onChangeText={setLocationStr} placeholder="e.g. Near Main Gate" />
              </View>
            </View>

            <View className="flex-row gap-x-3">
              <SsfButton label="Cancel" variant="outline" className="flex-1" onPress={resetForm} />
              <SsfButton 
                label={isCreatingVenue || isUpdatingVenue ? "Saving..." : "Save"} 
                className="flex-1" 
                onPress={handleSave} 
                disabled={isCreatingVenue || isUpdatingVenue} 
              />
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
