import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { THEME } from '../../constants/theme';

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ steps, currentStep }) => {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.stepsRow}>
        {steps.map((step, idx) => {
          const isActive = idx === currentStep;
          const isCompleted = idx < currentStep;

          return (
            <React.Fragment key={idx}>
              <View
                style={[
                  styles.circle,
                  {
                    backgroundColor: isDark ? '#1E293B' : colors.surfaceSecondary,
                    borderColor: colors.border,
                  },
                  isActive && styles.circleActive,
                  isCompleted && styles.circleCompleted,
                ]}
              >
                <Text
                  style={[
                    styles.circleText,
                    { color: colors.textSecondary },
                    (isActive || isCompleted) && styles.circleTextActive,
                  ]}
                >
                  {idx + 1}
                </Text>
              </View>
              {idx < steps.length - 1 && (
                <View
                  style={[
                    styles.line,
                    { backgroundColor: isDark ? '#1E293B' : '#CBD5E1' },
                    idx < currentStep && styles.lineActive,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>
      <Text style={[styles.currentStepTitle, { color: colors.textSecondary }]}>
        Step {currentStep + 1} of {steps.length}: {steps[currentStep]}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  circleCompleted: {
    backgroundColor: THEME.secondary,
    borderColor: THEME.secondary,
  },
  circleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  circleTextActive: {
    color: '#FFFFFF',
  },
  line: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
  },
  lineActive: {
    backgroundColor: THEME.secondary,
  },
  currentStepTitle: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: THEME.typography.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
