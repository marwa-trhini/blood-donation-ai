import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';

import { updateUserRole } from '../services/api';

export default function RoleSelectionScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSelectRole = async (role) => {
    if (loading) {
      return;
    }

    setError('');
    setLoading(true);

    try {
      await updateUserRole(role);

      if (role === 'donor') {
        navigation.navigate('DonorProfile');
      } else {
        navigation.navigate('RecipientProfile');
      }
    } catch (err) {
      setError(err?.message || 'Failed to update role. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.content}>
        <Text style={styles.icon}>🩸</Text>

        <Text style={styles.title}>How can we help you?</Text>

        <Text style={styles.subtitle}>
          Choose your role to continue setting up your BloodConnect account
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="large" style={styles.loader} />
        ) : null}

        <TouchableOpacity
          style={[styles.card, loading && styles.cardDisabled]}
          onPress={() => handleSelectRole('donor')}
          disabled={loading}
        >
          <Text style={styles.cardIcon}>❤️</Text>
          <Text style={styles.cardTitle}>I want to donate blood</Text>
          <Text style={styles.cardDescription}>
            Register as a donor and help save lives in your community.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, loading && styles.cardDisabled]}
          onPress={() => handleSelectRole('recipient')}
          disabled={loading}
        >
          <Text style={styles.cardIcon}>🏥</Text>
          <Text style={styles.cardTitle}>I need blood</Text>
          <Text style={styles.cardDescription}>
            Request blood support and connect with nearby donors.
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'red',
  },

  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },

  icon: {
    fontSize: 50,
    marginBottom: 20,
  },

  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 16,
    color: '#F5DADA',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },

  errorText: {
    color: '#FFFFFF',
    backgroundColor: '#8B0000',
    width: '100%',
    padding: 12,
    borderRadius: 8,
    textAlign: 'center',
    marginBottom: 15,
    fontSize: 14,
  },

  loader: {
    marginBottom: 15,
  },

  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
  },

  cardDisabled: {
    opacity: 0.7,
  },

  cardIcon: {
    fontSize: 40,
    marginBottom: 12,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 8,
    textAlign: 'center',
  },

  cardDescription: {
    fontSize: 15,
    color: '#555555',
    textAlign: 'center',
    lineHeight: 22,
  },
});
