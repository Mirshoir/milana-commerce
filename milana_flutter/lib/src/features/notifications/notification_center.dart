import 'package:flutter/material.dart';

import '../../localization/app_localization.dart';
import '../../models/distributor.dart';
import '../../services/distributor_repository.dart';
import '../../services/push_notification_service.dart';

class NotificationCenterSheet extends StatelessWidget {
  const NotificationCenterSheet({
    super.key,
    required this.repository,
    required this.pushNotifications,
    required this.customerId,
  });

  final DistributorRepository repository;
  final PushNotificationService pushNotifications;
  final String? customerId;

  @override
  Widget build(BuildContext context) {
    final id = customerId ?? '';
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .9,
      minChildSize: .6,
      maxChildSize: .98,
      builder: (context, scrollController) => ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 28),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  context.localize('notifications.title'),
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          if (id.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Column(
                children: [
                  const Icon(Icons.notifications_off_outlined, size: 54),
                  const SizedBox(height: 12),
                  Text(
                    context.localize('notifications.sign_in'),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            )
          else ...[
            AnimatedBuilder(
              animation: pushNotifications,
              builder: (context, _) => _PushPermissionCard(
                enabled: pushNotifications.enabled,
                onEnable: () => pushNotifications.enable(
                  customerId: id,
                  languageCode: context.currentLanguageCode,
                ),
              ),
            ),
            const SizedBox(height: 12),
            _NotificationPreferencesEditor(
              repository: repository,
              customerId: id,
            ),
            const SizedBox(height: 18),
            Text(
              context.localize('notifications.inbox'),
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            StreamBuilder<List<AccountNotification>>(
              stream: repository.notificationsFor(id),
              builder: (context, snapshot) {
                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }
                final notifications = snapshot.data!;
                if (notifications.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 28),
                    child: Text(
                      context.localize('notifications.empty'),
                      textAlign: TextAlign.center,
                    ),
                  );
                }
                return Column(
                  children: notifications
                      .map(
                        (notification) => _NotificationTile(
                          notification: notification,
                          onTap: notification.read
                              ? null
                              : () => repository.markNotificationRead(
                                  notification.id,
                                ),
                        ),
                      )
                      .toList(),
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _PushPermissionCard extends StatelessWidget {
  const _PushPermissionCard({required this.enabled, required this.onEnable});
  final bool enabled;
  final Future<bool> Function() onEnable;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Theme.of(
        context,
      ).colorScheme.primaryContainer.withValues(alpha: .3),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Row(
      children: [
        Icon(
          enabled ? Icons.notifications_active : Icons.notifications_outlined,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            context.localize(
              enabled
                  ? 'notifications.push.enabled'
                  : 'notifications.push.prompt',
            ),
          ),
        ),
        if (!enabled)
          TextButton(
            onPressed: () async {
              final success = await onEnable();
              if (!success && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      context.localize('notifications.push.failed'),
                    ),
                  ),
                );
              }
            },
            child: Text(context.localize('notifications.push.enable')),
          ),
      ],
    ),
  );
}

class _NotificationPreferencesEditor extends StatefulWidget {
  const _NotificationPreferencesEditor({
    required this.repository,
    required this.customerId,
  });
  final DistributorRepository repository;
  final String customerId;
  @override
  State<_NotificationPreferencesEditor> createState() =>
      _NotificationPreferencesEditorState();
}

class _NotificationPreferencesEditorState
    extends State<_NotificationPreferencesEditor> {
  NotificationPreferences? local;
  bool saving = false;

  @override
  Widget build(BuildContext context) => StreamBuilder<NotificationPreferences>(
    stream: widget.repository.notificationPreferencesFor(widget.customerId),
    builder: (context, snapshot) {
      final preferences =
          local ?? snapshot.data ?? const NotificationPreferences();
      return ExpansionTile(
        tilePadding: EdgeInsets.zero,
        title: Text(
          context.localize('notifications.preferences'),
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: Text(context.localize('notifications.preferences_hint')),
        children: [
          _toggle(
            context,
            'notifications.preference.orders',
            preferences.orderUpdates,
            (value) => preferences.copyWith(orderUpdates: value),
          ),
          _toggle(
            context,
            'notifications.preference.application',
            preferences.applicationUpdates,
            (value) => preferences.copyWith(applicationUpdates: value),
          ),
          _toggle(
            context,
            'notifications.preference.collections',
            preferences.newCollections,
            (value) => preferences.copyWith(newCollections: value),
          ),
          _toggle(
            context,
            'notifications.preference.restocks',
            preferences.restocks,
            (value) => preferences.copyWith(restocks: value),
          ),
          _toggle(
            context,
            'notifications.preference.offers',
            preferences.distributorOffers,
            (value) => preferences.copyWith(distributorOffers: value),
          ),
          _toggle(
            context,
            'notifications.preference.news',
            preferences.companyNews,
            (value) => preferences.copyWith(companyNews: value),
          ),
        ],
      );
    },
  );

  Widget _toggle(
    BuildContext context,
    String key,
    bool value,
    NotificationPreferences Function(bool) update,
  ) => SwitchListTile(
    contentPadding: EdgeInsets.zero,
    value: value,
    title: Text(context.localize(key)),
    onChanged: saving
        ? null
        : (next) async {
            final previous = update(value);
            final updated = update(next);
            final messenger = ScaffoldMessenger.of(context);
            final failureMessage = context.localize(
              'notifications.preferences_failed',
            );
            setState(() {
              local = updated;
              saving = true;
            });
            try {
              await widget.repository.saveNotificationPreferences(updated);
            } catch (_) {
              if (mounted) {
                setState(() => local = previous);
                messenger.showSnackBar(SnackBar(content: Text(failureMessage)));
              }
            } finally {
              if (mounted) setState(() => saving = false);
            }
          },
  );
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.notification, required this.onTap});
  final AccountNotification notification;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Card(
    color: notification.read
        ? Theme.of(context).colorScheme.surface
        : Theme.of(context).colorScheme.primaryContainer.withValues(alpha: .35),
    child: ListTile(
      onTap: onTap,
      leading: Icon(
        notification.type.contains('application')
            ? Icons.business_center_outlined
            : Icons.notifications_outlined,
      ),
      title: Text(
        notification.title,
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      subtitle: Text(notification.message),
      trailing: notification.read
          ? const Icon(Icons.done, size: 18)
          : const Icon(Icons.circle, size: 10),
    ),
  );
}
