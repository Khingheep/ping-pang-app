import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  adminDeletePlayer,
  resetDisputes,
  resolveReport,
  useAdminReports,
  useIsAdmin,
  type AdminReport,
} from '@/lib/players/moderation';
import { confirm, notify } from '@/lib/ui/alert';

/**
 * Dashboard admin (Paul 07/07/2026) : tableau des joueurs signalés pour fraude.
 * « En soit ya rien à faire, ça se régule tout seul (3 refus max) — mais c'est bien
 * d'avoir un dashboard si jamais il faut intervenir : supprimer un compte par ex. »
 * L'accès organisateur tournoi existe déjà (0057) ; ici = signalements + comptes.
 */
export default function AdminScreen() {
  const { session } = useAuth();
  const myId = session?.user?.id;
  const adminQ = useIsAdmin(myId);
  const reportsQ = useAdminReports(adminQ.data === true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const reports = reportsQ.data ?? [];
  const open = reports.filter((r) => r.status === 'open');
  const closed = reports.filter((r) => r.status !== 'open');

  async function act(r: AdminReport, fn: () => Promise<void>, successMsg: string) {
    try {
      setActingId(r.id);
      await fn();
      await reportsQ.refetch();
      notify(successMsg);
    } catch (e) {
      notify('Erreur', e instanceof Error ? e.message : 'Réessaie plus tard.');
    } finally {
      setActingId(null);
    }
  }

  async function onDelete(r: AdminReport) {
    if (!r.reported) return;
    const ok = await confirm({
      title: `Supprimer le compte de ${r.reported.display_name} ?`,
      message: 'Compte + connexion supprimés définitivement. Ses matchs joués restent.',
      confirmText: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    await act(
      r,
      async () => {
        await adminDeletePlayer(r.reported!.id);
        await resolveReport(r.id, 'resolved');
      },
      'Compte supprimé.',
    );
  }

  if (adminQ.isLoading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Palette.onyx} />
      </View>
    );
  }

  if (!adminQ.data) {
    return (
      <View style={[styles.root, styles.center]}>
        <ThemedText type="default" themeColor="textSecondary">
          Réservé aux admins.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={Palette.onyx} />
          </Pressable>
          <ThemedText type="cardTitle">Admin · Signalements</ThemedText>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {reportsQ.isLoading ? (
            <ActivityIndicator color={Palette.onyx} style={{ marginTop: Spacing.five }} />
          ) : open.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={34} color={Palette.onyx} />
              <ThemedText type="default" themeColor="textSecondary">
                Aucun signalement en cours. 🎉
              </ThemedText>
            </View>
          ) : (
            open.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                busy={actingId === r.id}
                onOpenPlayer={(id) => router.push({ pathname: '/player', params: { id } })}
                onResolve={() => act(r, () => resolveReport(r.id, 'resolved'), 'Signalement traité.')}
                onDismiss={() => act(r, () => resolveReport(r.id, 'dismissed'), 'Signalement ignoré.')}
                onResetDisputes={() =>
                  r.reported
                    ? act(r, () => resetDisputes(r.reported!.id), 'Compteur de contestations remis à zéro.')
                    : undefined
                }
                onDelete={() => onDelete(r)}
              />
            ))
          )}

          {closed.length ? (
            <>
              <Pressable style={styles.closedToggle} onPress={() => setShowClosed((v) => !v)} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Historique ({closed.length})
                </ThemedText>
                <Ionicons name={showClosed ? 'chevron-up' : 'chevron-down'} size={16} color={Palette.grey} />
              </Pressable>
              {showClosed
                ? closed.map((r) => (
                    <View key={r.id} style={[styles.card, { opacity: 0.6 }]}>
                      <View style={styles.cardHead}>
                        <ThemedText type="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
                          {r.reported?.display_name ?? 'Compte supprimé'}
                        </ThemedText>
                        <View style={styles.badge}>
                          <ThemedText type="small" themeColor="textSecondary">
                            {r.status === 'resolved' ? 'Traité' : 'Ignoré'}
                          </ThemedText>
                        </View>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        {r.reason}
                      </ThemedText>
                    </View>
                  ))
                : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ReportCard({
  report: r,
  busy,
  onOpenPlayer,
  onResolve,
  onDismiss,
  onResetDisputes,
  onDelete,
}: {
  report: AdminReport;
  busy: boolean;
  onOpenPlayer: (id: string) => void;
  onResolve: () => void;
  onDismiss: () => void;
  onResetDisputes?: () => void;
  onDelete: () => void;
}) {
  const d = new Date(r.created_at);
  const dateLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return (
    <View style={styles.card}>
      <Pressable
        style={styles.cardHead}
        onPress={() => (r.reported ? onOpenPlayer(r.reported.id) : undefined)}>
        <ThemedText type="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
          {r.reported?.display_name ?? 'Compte supprimé'}
        </ThemedText>
        {r.reported?.dispute_count ? (
          <View style={[styles.badge, r.reported.dispute_count >= 3 && styles.badgeAlert]}>
            <ThemedText
              type="small"
              themeColor={r.reported.dispute_count >= 3 ? 'onBrand' : 'textSecondary'}>
              {r.reported.dispute_count} refus
            </ThemedText>
          </View>
        ) : null}
      </Pressable>
      <ThemedText type="small" themeColor="textSecondary">
        Signalé par {r.reporter?.display_name ?? '?'} · {dateLabel}
      </ThemedText>
      <ThemedText type="default" style={styles.reason}>
        {r.reason}
      </ThemedText>

      {busy ? (
        <ActivityIndicator color={Palette.onyx} />
      ) : (
        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={onResolve}>
            <Ionicons name="checkmark" size={15} color={Palette.onyx} />
            <ThemedText type="smallBold" themeColor="brand">
              Traité
            </ThemedText>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={onDismiss}>
            <Ionicons name="close" size={15} color={Palette.grey} />
            <ThemedText type="smallBold" themeColor="textSecondary">
              Ignorer
            </ThemedText>
          </Pressable>
          {onResetDisputes ? (
            <Pressable style={styles.actionBtn} onPress={onResetDisputes}>
              <Ionicons name="refresh" size={15} color={Palette.grey} />
              <ThemedText type="smallBold" themeColor="textSecondary">
                RAZ refus
              </ThemedText>
            </Pressable>
          ) : null}
          <Pressable style={[styles.actionBtn, styles.actionDanger]} onPress={onDelete}>
            <Ionicons name="trash-outline" size={15} color={Palette.redInk} />
            <ThemedText type="smallBold" themeColor="danger">
              Supprimer
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.whitePP },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  empty: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.six },
  card: {
    backgroundColor: Palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.xs,
    backgroundColor: Palette.whitePP,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  badgeAlert: { backgroundColor: Palette.redInk, borderColor: Palette.redInk },
  reason: { marginTop: Spacing.one },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    backgroundColor: Palette.whitePP,
  },
  actionDanger: { borderColor: Palette.redInk },
  closedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
  },
});
