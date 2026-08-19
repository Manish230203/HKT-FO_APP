import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Clock, X, Check } from 'lucide-react-native';
import { THEME } from '../../constants/theme';

interface TimePicker24ModalProps {
  visible: boolean;
  title?: string;
  initialValue?: string; // e.g. "14:30" or "09:00"
  onConfirm: (time24: string) => void;
  onClose: () => void;
}

export function TimePicker24Modal({
  visible,
  title = 'Select Time (24-Hour Clock)',
  initialValue = '10:00',
  onConfirm,
  onClose,
}: TimePicker24ModalProps) {
  const [selectedHour, setSelectedHour] = useState('10');
  const [selectedMinute, setSelectedMinute] = useState('00');

  useEffect(() => {
    if (initialValue && initialValue.includes(':')) {
      const parts = initialValue.split(':');
      const h = parts[0].padStart(2, '0');
      const m = parts[1].replace(/\D/g, '').substring(0, 2).padStart(2, '0');
      if (parseInt(h, 10) >= 0 && parseInt(h, 10) <= 23) {
        setSelectedHour(h);
      }
      if (parseInt(m, 10) >= 0 && parseInt(m, 10) <= 59) {
        setSelectedMinute(m);
      }
    } else {
      const now = new Date();
      setSelectedHour(String(now.getHours()).padStart(2, '0'));
      setSelectedMinute(String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0'));
    }
  }, [initialValue, visible]);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  const handleConfirm = () => {
    const formatted = `${selectedHour}:${selectedMinute}`;
    onConfirm(formatted);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Clock color={THEME.primary} size={20} style={{ marginRight: 8 }} />
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X color="#94A3B8" size={20} />
            </TouchableOpacity>
          </View>

          {/* Time Display Badge */}
          <View style={styles.displayBadge}>
            <Text style={styles.displayText}>
              {selectedHour} : {selectedMinute}
            </Text>
            <Text style={styles.displaySubtext}>24-HOUR FORMAT (HH:mm)</Text>
          </View>

          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {/* Hours Section */}
            <Text style={styles.sectionLabel}>HOUR (00 - 23)</Text>
            <View style={styles.gridRow}>
              {hours.map((h) => {
                const isSelected = selectedHour === h;
                return (
                  <TouchableOpacity
                    key={h}
                    onPress={() => setSelectedHour(h)}
                    style={[styles.pill, isSelected && styles.pillSelected]}
                  >
                    <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>{h}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Minutes Section */}
            <Text style={styles.sectionLabel}>MINUTE (00 - 55)</Text>
            <View style={styles.gridRow}>
              {minutes.map((m) => {
                const isSelected = selectedMinute === m;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setSelectedMinute(m)}
                    style={[styles.pill, isSelected && styles.pillSelected]}
                  >
                    <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Confirm Button */}
          <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
            <Check color="#FFFFFF" size={18} style={{ marginRight: 6 }} />
            <Text style={styles.confirmBtnText}>Set Time ({selectedHour}:{selectedMinute})</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: THEME.typography.md,
    fontWeight: '700',
    color: THEME.text,
  },
  closeBtn: {
    padding: 4,
  },
  displayBadge: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.primary,
  },
  displayText: {
    fontSize: 32,
    fontWeight: '800',
    color: THEME.primary,
    letterSpacing: 2,
  },
  displaySubtext: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.textVariant,
    marginTop: 2,
    letterSpacing: 0.8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.textVariant,
    marginBottom: 8,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  pill: {
    width: 48,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pillSelected: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.text,
  },
  pillTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
