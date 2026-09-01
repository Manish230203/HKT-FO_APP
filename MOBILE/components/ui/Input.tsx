import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { THEME } from '../../constants/theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  leftIcon,
  containerStyle,
  style,
  ...props
}) => {
  const isMultiline = !!props.multiline;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          isMultiline ? styles.inputWrapperMultiline : null,
          error ? styles.inputError : null,
        ]}
      >
        {leftIcon && <View style={[styles.leftIconContainer, isMultiline ? { marginTop: 2 } : null]}>{leftIcon}</View>}
        <TextInput
          style={[
            styles.input,
            isMultiline ? styles.inputMultiline : null,
            style,
          ]}
          textAlignVertical={isMultiline ? 'top' : 'center'}
          placeholderTextColor="#64748B"
          {...props}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: THEME.typography.xs,
    fontWeight: '600',
    color: THEME.textVariant,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 14,
  },
  inputWrapperMultiline: {
    alignItems: 'flex-start',
    paddingVertical: 12,
    minHeight: 90,
  },
  leftIconContainer: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 40,
    color: THEME.text,
    fontSize: THEME.typography.sm,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
    paddingTop: 0,
    paddingBottom: 0,
  },
  inputError: {
    borderColor: THEME.danger,
  },
  errorText: {
    color: THEME.danger,
    fontSize: THEME.typography.xs,
    marginTop: 4,
  },
});
