import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../localization/app_localization.dart';
import '../../models/distributor.dart';
import '../../services/auth_forms.dart';
import '../../services/analytics_service.dart';
import '../../services/auth_service.dart';
import '../../services/distributor_repository.dart';

const _salesPhone = '+998501551010';
const _salesWhatsAppNumber = '998501551010';
const _salesTelegramUrl = String.fromEnvironment('SALES_TELEGRAM_URL');

class DistributorScreen extends StatelessWidget {
  const DistributorScreen({
    super.key,
    required this.repository,
    required this.auth,
    required this.onOpenSupport,
    required this.onOpenNotifications,
  });

  final DistributorRepository repository;
  final AuthService auth;
  final VoidCallback onOpenSupport;
  final VoidCallback onOpenNotifications;

  @override
  Widget build(BuildContext context) {
    final customer = auth.customer;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
      children: [
        _PartnershipHero(
          onApply: () => _openApplication(context),
          onContactSales: () => _openWhatsApp(context, quote: false),
        ),
        const SizedBox(height: 14),
        if (customer != null)
          DistributorStatusPanel(
            repository: repository,
            customerId: customer.id,
            onApply: () => _openApplication(context),
          ),
        const SizedBox(height: 14),
        const _MilanaProofStrip(),
        const SizedBox(height: 22),
        _SectionTitle(
          title: context.localize('distributor.why.title'),
          subtitle: context.localize('distributor.why.subtitle'),
        ),
        const SizedBox(height: 10),
        _FeatureGrid(
          features: [
            _Feature(
              Icons.factory_outlined,
              context.localize('distributor.why.full_cycle'),
            ),
            _Feature(
              Icons.inventory_2_outlined,
              context.localize('distributor.why.supply'),
            ),
            _Feature(
              Icons.public_outlined,
              context.localize('distributor.why.export'),
            ),
            _Feature(
              Icons.style_outlined,
              context.localize('distributor.why.private_label'),
            ),
            _Feature(
              Icons.campaign_outlined,
              context.localize('distributor.why.marketing'),
            ),
            _Feature(
              Icons.verified_outlined,
              context.localize('distributor.why.quality'),
            ),
          ],
        ),
        const SizedBox(height: 22),
        _InfoCard(
          icon: Icons.handshake_outlined,
          title: context.localize('distributor.requirements.title'),
          lines: [
            context.localize('distributor.requirements.business'),
            context.localize('distributor.requirements.volume'),
            context.localize('distributor.requirements.territory'),
            context.localize('distributor.requirements.brand'),
          ],
        ),
        const SizedBox(height: 12),
        _InfoCard(
          icon: Icons.local_shipping_outlined,
          title: context.localize('distributor.logistics.title'),
          lines: [
            context.localize('distributor.logistics.uzbekistan'),
            context.localize('distributor.logistics.export'),
            context.localize('distributor.logistics.documents'),
            context.localize('distributor.logistics.quote'),
          ],
        ),
        const SizedBox(height: 22),
        _SectionTitle(
          title: context.localize('distributor.sales.title'),
          subtitle: context.localize('distributor.sales.subtitle'),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            FilledButton.icon(
              onPressed: () => _openWhatsApp(context, quote: false),
              icon: const Icon(Icons.chat_outlined),
              label: Text(context.localize('distributor.cta.contact_sales')),
            ),
            OutlinedButton.icon(
              onPressed: () => _openWhatsApp(context, quote: true),
              icon: const Icon(Icons.request_quote_outlined),
              label: Text(context.localize('distributor.cta.request_pricing')),
            ),
            OutlinedButton.icon(
              onPressed: () =>
                  _launch(context, Uri(scheme: 'tel', path: _salesPhone)),
              icon: const Icon(Icons.call_outlined),
              label: Text(context.localize('distributor.cta.call')),
            ),
            if (_salesTelegramUrl.isNotEmpty)
              OutlinedButton.icon(
                onPressed: () => _launch(context, Uri.parse(_salesTelegramUrl)),
                icon: const Icon(Icons.send_outlined),
                label: const Text('Telegram'),
              ),
            OutlinedButton.icon(
              onPressed: onOpenSupport,
              icon: const Icon(Icons.support_agent_outlined),
              label: Text(context.localize('support')),
            ),
            OutlinedButton.icon(
              onPressed: onOpenNotifications,
              icon: const Icon(Icons.notifications_outlined),
              label: Text(context.localize('notifications.title')),
            ),
          ],
        ),
        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: () => _openApplication(context),
          icon: const Icon(Icons.business_center_outlined),
          label: Text(context.localize('distributor.cta.apply')),
        ),
      ],
    );
  }

  Future<void> _openApplication(BuildContext context) async {
    final receipt = await showModalBottomSheet<DistributorApplicationReceipt>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => DistributorApplicationSheet(
        repository: repository,
        customer: auth.customer,
      ),
    );
    if (context.mounted && receipt != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            context.localize(
              'distributor.application.success',
              args: {'number': receipt.number},
            ),
          ),
        ),
      );
    }
  }

  Future<void> _openWhatsApp(BuildContext context, {required bool quote}) {
    final message = quote
        ? context.localize('distributor.whatsapp.quote')
        : context.localize('distributor.whatsapp.contact');
    return _launch(
      context,
      Uri.parse(
        'https://wa.me/$_salesWhatsAppNumber?text=${Uri.encodeComponent(message)}',
      ),
    );
  }

  Future<void> _launch(BuildContext context, Uri uri) async {
    var opened = false;
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      opened = false;
    }
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.localize('distributor.contact.failed'))),
      );
    }
  }
}

class DistributorStatusPanel extends StatelessWidget {
  const DistributorStatusPanel({
    super.key,
    required this.repository,
    required this.customerId,
    required this.onApply,
  });

  final DistributorRepository repository;
  final String customerId;
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<DistributorApplication>>(
      stream: repository.applicationsFor(customerId),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting &&
            !snapshot.hasData) {
          return const LinearProgressIndicator();
        }
        final applications = snapshot.data ?? const <DistributorApplication>[];
        if (applications.isEmpty) {
          return _StatusCard(
            icon: Icons.business_center_outlined,
            title: context.localize('distributor.status.not_applied'),
            message: context.localize('distributor.status.not_applied_hint'),
            action: TextButton(
              onPressed: onApply,
              child: Text(context.localize('distributor.cta.apply')),
            ),
          );
        }
        final application = applications.first;
        final statusKey = distributorApplicationStatusValue(application.status);
        return _StatusCard(
          icon: application.status == DistributorApplicationStatus.approved
              ? Icons.verified_outlined
              : Icons.pending_actions_outlined,
          title: context.localize(
            'distributor.status.title',
            args: {'number': application.number},
          ),
          message: context.localize('distributor.status.$statusKey'),
          detail: application.managerMessage,
        );
      },
    );
  }
}

class DistributorApplicationSheet extends StatefulWidget {
  const DistributorApplicationSheet({
    super.key,
    required this.repository,
    required this.customer,
  });

  final DistributorRepository repository;
  final Customer? customer;

  @override
  State<DistributorApplicationSheet> createState() =>
      _DistributorApplicationSheetState();
}

class _DistributorApplicationSheetState
    extends State<DistributorApplicationSheet> {
  final formKey = GlobalKey<FormState>();
  late final String clientApplicationId;
  late final contactName = TextEditingController(
    text: widget.customer?.name ?? '',
  );
  late final companyName = TextEditingController(
    text: widget.customer?.companyName ?? '',
  );
  late final phone = TextEditingController(text: widget.customer?.phone ?? '');
  late final email = TextEditingController(text: widget.customer?.email ?? '');
  late final country = TextEditingController(
    text: widget.customer?.country.isNotEmpty == true
        ? widget.customer!.country
        : 'Uzbekistan',
  );
  late final city = TextEditingController(text: widget.customer?.city ?? '');
  bool accepted = false;
  bool sending = false;

  @override
  void initState() {
    super.initState();
    clientApplicationId =
        'flutter_${DateTime.now().microsecondsSinceEpoch}_${identityHashCode(this)}';
  }

  @override
  void dispose() {
    contactName.dispose();
    companyName.dispose();
    phone.dispose();
    email.dispose();
    country.dispose();
    city.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .94,
      minChildSize: .65,
      maxChildSize: .98,
      builder: (context, scrollController) => Form(
        key: formKey,
        child: ListView(
          controller: scrollController,
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 32),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    context.localize('distributor.application.title'),
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: sending ? null : () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            Text(context.localize('distributor.application.subtitle')),
            const SizedBox(height: 16),
            _field(context, contactName, 'distributor.field.contact_name'),
            _field(context, companyName, 'distributor.field.company_name'),
            _field(
              context,
              phone,
              'distributor.field.phone',
              keyboardType: TextInputType.phone,
              validator: (value) => validatePhone(value),
            ),
            _field(
              context,
              email,
              'distributor.field.email',
              keyboardType: TextInputType.emailAddress,
              validator: validateEmail,
            ),
            _field(context, country, 'distributor.field.country'),
            _field(context, city, 'distributor.field.city', required: false),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: accepted,
              controlAffinity: ListTileControlAffinity.leading,
              title: Text(context.localize('distributor.field.consent')),
              onChanged: sending
                  ? null
                  : (value) => setState(() => accepted = value ?? false),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: sending ? null : _submit,
              icon: sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send_outlined),
              label: Text(context.localize('distributor.application.submit')),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(
    BuildContext context,
    TextEditingController controller,
    String key, {
    bool required = true,
    int maxLines = 1,
    TextInputType? keyboardType,
    String? Function(String?)? validator,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextFormField(
        controller: controller,
        maxLines: maxLines,
        keyboardType: keyboardType,
        decoration: InputDecoration(labelText: context.localize(key)),
        validator:
            validator ??
            (required
                ? (value) => (value ?? '').trim().length < 2
                      ? context.localize('form.required')
                      : null
                : null),
      ),
    );
  }

  Future<void> _submit() async {
    if (!formKey.currentState!.validate()) return;
    if (!accepted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.localize('distributor.consent.required')),
        ),
      );
      return;
    }
    final analytics = context.analytics;
    setState(() => sending = true);
    try {
      final receipt = await widget.repository.submitApplication(
        DistributorApplicationRequest(
          clientApplicationId: clientApplicationId,
          contactName: contactName.text.trim(),
          companyName: companyName.text.trim(),
          phone: normalizePhoneNumber(phone.text),
          email: normalizeEmail(email.text),
          country: country.text.trim(),
          city: city.text.trim(),
          legalAccepted: accepted,
          languageCode: context.currentLanguageCode,
        ),
      );
      unawaited(analytics?.logDistributorLead());
      if (mounted) Navigator.pop(context, receipt);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              context.localize(
                'distributor.application.failed',
                args: {'error': '$error'},
              ),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }
}

class _PartnershipHero extends StatelessWidget {
  const _PartnershipHero({required this.onApply, required this.onContactSales});

  final VoidCallback onApply;
  final VoidCallback onContactSales;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: colors.onSurface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.localize('distributor.hero.eyebrow'),
            style: TextStyle(
              color: colors.surface.withValues(alpha: .7),
              letterSpacing: 2,
              fontWeight: FontWeight.w700,
              fontSize: 11,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            context.localize('distributor.hero.title'),
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              color: colors.surface,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            context.localize('distributor.hero.subtitle'),
            style: TextStyle(color: colors.surface.withValues(alpha: .75)),
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              FilledButton(
                onPressed: onApply,
                style: FilledButton.styleFrom(
                  backgroundColor: colors.surface,
                  foregroundColor: colors.onSurface,
                ),
                child: Text(context.localize('distributor.cta.apply')),
              ),
              OutlinedButton(
                onPressed: onContactSales,
                style: OutlinedButton.styleFrom(
                  foregroundColor: colors.surface,
                  side: BorderSide(color: colors.surface.withValues(alpha: .6)),
                ),
                child: Text(context.localize('distributor.cta.contact_sales')),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MilanaProofStrip extends StatelessWidget {
  const _MilanaProofStrip();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _Proof(
          value: '3',
          label: context.localize('distributor.proof.factories'),
        ),
        _Proof(
          value: '25+',
          label: context.localize('distributor.proof.years'),
        ),
        _Proof(
          value: '20+',
          label: context.localize('distributor.proof.countries'),
        ),
      ],
    );
  }
}

class _Proof extends StatelessWidget {
  const _Proof({required this.value, required this.label});
  final String value;
  final String label;
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
          ),
          Text(
            label,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, required this.subtitle});
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: Theme.of(
          context,
        ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
      ),
      const SizedBox(height: 4),
      Text(subtitle),
    ],
  );
}

class _Feature {
  const _Feature(this.icon, this.label);
  final IconData icon;
  final String label;
}

class _FeatureGrid extends StatelessWidget {
  const _FeatureGrid({required this.features});
  final List<_Feature> features;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final width = constraints.maxWidth >= 700
          ? (constraints.maxWidth - 20) / 3
          : (constraints.maxWidth - 10) / 2;
      return Wrap(
        spacing: 10,
        runSpacing: 10,
        children: features
            .map(
              (feature) => Container(
                width: width,
                constraints: const BoxConstraints(minHeight: 110),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  border: Border.all(color: Theme.of(context).dividerColor),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(feature.icon),
                    const SizedBox(height: 10),
                    Text(
                      feature.label,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
            )
            .toList(),
      );
    },
  );
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.icon,
    required this.title,
    required this.lines,
  });
  final IconData icon;
  final String title;
  final List<String> lines;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: Theme.of(context).dividerColor),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 17,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        for (final line in lines)
          Padding(
            padding: const EdgeInsets.only(bottom: 7),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.check_circle_outline, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text(line)),
              ],
            ),
          ),
      ],
    ),
  );
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.icon,
    required this.title,
    required this.message,
    this.detail = '',
    this.action,
  });
  final IconData icon;
  final String title;
  final String message;
  final String detail;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Theme.of(
        context,
      ).colorScheme.primaryContainer.withValues(alpha: .35),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
              const SizedBox(height: 3),
              Text(message),
              if (detail.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(detail),
              ],
              ?action,
            ],
          ),
        ),
      ],
    ),
  );
}
