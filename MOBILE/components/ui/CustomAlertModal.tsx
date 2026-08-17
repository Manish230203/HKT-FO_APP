import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { Button } from './Button';

interface CustomAlertModalProps {
  visible: boolean;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  onConfirm?: () => void;
  confirmText?: string;
}

export const CustomAlertModal: React.FC<CustomAlertModalProps> = ({
  visible,
  title,
  message,
  type = 'info',
  onClose,
  onConfirm,
  confirmText = 'OK',
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={[styles.title, type === 'error' && { color: THEME.danger }]}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          
          <View style={styles.buttonRow}>
            {onConfirm ? (
              <>
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={onClose}
                  style={styles.flexBtn}
                />
                <Button
                  title={confirmText}
                  variant={type === 'error' ? 'danger' : 'primary'}
                  onPress={onConfirm}
                  style={styles.flexBtn}
                />
              </>
            ) : (
              <Button
                title={confirmText}
                variant={type === 'error' ? 'danger' : 'primary'}
                onPress={onClose}
                style={{ width: '100%' }}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  title: {
    fontSize: THEME.typography.lg,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 8,
  },
  message: {
    fontSize: THEME.typography.sm,
    color: THEME.textVariant,
    lineHeight: 20,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  flexBtn: {
    flex: 1,
  },
});
