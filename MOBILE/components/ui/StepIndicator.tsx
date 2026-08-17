import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME } from '../../constants/theme';

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ steps, currentStep }) => {
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
                  isActive && styles.circleActive,
                  isCompleted && styles.circleCompleted,
                ]}
              >
                <Text style={[styles.circleText, (isActive || isCompleted) && styles.circleTextActive]}>
                  {idx + 1}
                </Text>
              </View>
              {idx < steps.length - 1 && (
                <View
                  style={[
                    styles.line,
                    idx < currentStep && styles.lineActive,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>
      <Text style={styles.currentStepTitle}>
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
    justifyContent: 'between',
    paddingHorizontal: 8,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: THEME.border,
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
    color: THEME.textVariant,
  },
  circleTextActive: {
    color: '#FFFFFF',
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: '#1E293B',
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
    color: THEME.textVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
