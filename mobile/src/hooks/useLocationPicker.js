import { useEffect } from 'react';

export function openLocationPicker(navigation, returnRouteName, { initialCoordinates, currentFields }) {
  navigation.navigate('LocationPicker', {
    returnRouteName,
    initialCoordinates,
    currentFields: {
      city: currentFields?.city || '',
      country: currentFields?.country || '',
      addressLine: currentFields?.addressLine || '',
    },
  });
}

export function applyMapPickedLocation(picked, setters) {
  const {
    setLocationError,
    setCoordinates,
    setLocationDetected,
    setCity,
    setCountry,
    setAddressLine,
  } = setters;

  setLocationError('');

  if (picked.coordinates) {
    setCoordinates(picked.coordinates);
    setLocationDetected(true);
  }

  const nextCity = String(picked.city || '').trim();
  if (nextCity) {
    setCity(nextCity);
  }

  const nextCountry = String(picked.country || '').trim();
  if (nextCountry) {
    setCountry(nextCountry);
  }

  if (picked.addressLine !== undefined) {
    setAddressLine(String(picked.addressLine || '').trim());
  }
}

export function useLocationPickerResult(route, navigation, applyPickedLocation) {
  const pickedLocation = route.params?.pickedLocation;

  useEffect(() => {
    if (!pickedLocation) {
      return;
    }

    applyPickedLocation(pickedLocation);
    navigation.setParams({ pickedLocation: undefined });
  }, [pickedLocation, navigation, applyPickedLocation]);
}
