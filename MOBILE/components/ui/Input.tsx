import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

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
  const { colors, isDark, theme } = useTheme();
  const isMultiline = !!props.multiline;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={[styles.label, { color: colors.textVariant }]}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
            borderColor: error ? colors.danger : colors.border,
          },
          isMultiline ? styles.inputWrapperMultiline : null,
        ]}
      >
        {leftIcon && <View style={[styles.leftIconContainer, isMultiline ? { marginTop: 2 } : null]}>{leftIcon}</View>}
        <TextInput
          style={[
            styles.input,
            { color: colors.text, fontSize: theme.typography.sm },
            isMultiline ? styles.inputMultiline : null,
            style,
          ]}
          textAlignVertical={isMultiline ? 'top' : 'center'}
          placeholderTextColor={colors.textVariant}
          {...props}
        />
      </View>
      {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
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
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
    paddingTop: 0,
    paddingBottom: 0,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
});
