import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import RoleSelectionScreen from '../screens/RoleSelectionScreen';
import DonorProfileScreen from '../screens/DonorProfileScreen';
import DonorHomeScreen from '../screens/DonorHomeScreen';
import RecipientProfileScreen from '../screens/RecipientProfileScreen';
import RecipientHomeScreen from '../screens/RecipientHomeScreen';
import CreateBloodRequestScreen from '../screens/CreateBloodRequestScreen';
import MatchingDonorsScreen from '../screens/MatchingDonorsScreen';
import DonationRequestsScreen from '../screens/DonationRequestsScreen';
import RecipientDonationRequestsScreen from '../screens/RecipientDonationRequestsScreen';
import BloodRequestDetailsScreen from '../screens/BloodRequestDetailsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import LocationPickerScreen from '../screens/LocationPickerScreen';
import MyRideRequestsScreen from '../screens/MyRideRequestsScreen';
import RecipientRideRequestsScreen from '../screens/RecipientRideRequestsScreen';
import ChatScreen from '../screens/ChatScreen';
import MessagesScreen from '../screens/MessagesScreen';
import AIAssistantScreen from '../screens/AIAssistantScreen';
import { LogoutConfirmationProvider } from '../components/LogoutConfirmationModal';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('token').then((token) => {
      setInitialRoute(token ? 'Welcome' : 'Login');
    });
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#E53935" />
      </View>
    );
  }

  return (
    <LogoutConfirmationProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerShown: false, detachInactiveScreens: false }}
        >
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
          <Stack.Screen name="DonorProfile" component={DonorProfileScreen} />
          <Stack.Screen name="DonorHome" component={DonorHomeScreen} />
          <Stack.Screen name="RecipientProfile" component={RecipientProfileScreen} />
          <Stack.Screen name="RecipientHome" component={RecipientHomeScreen} />
          <Stack.Screen name="CreateBloodRequest" component={CreateBloodRequestScreen} />
          <Stack.Screen name="MatchingDonors" component={MatchingDonorsScreen} />
          <Stack.Screen name="DonationRequests" component={DonationRequestsScreen} />
          <Stack.Screen name="RecipientDonationRequests" component={RecipientDonationRequestsScreen} />
          <Stack.Screen name="BloodRequestDetails" component={BloodRequestDetailsScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="MyRideRequests" component={MyRideRequestsScreen} />
          <Stack.Screen name="RecipientRideRequests" component={RecipientRideRequestsScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Messages" component={MessagesScreen} />
          <Stack.Screen name="AIAssistant" component={AIAssistantScreen} />
          <Stack.Screen name="LocationPicker" component={LocationPickerScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </LogoutConfirmationProvider>
  );
}
