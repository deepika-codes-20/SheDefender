import re
from flask import Blueprint, request, jsonify
from backend.app.models import db, TrustedContact
from backend.app.auth.decorators import token_required, role_required

contact_bp = Blueprint('trusted_contacts', __name__, url_prefix='/api/trusted-contacts')

@contact_bp.route('', methods=['GET'])
@token_required
@role_required(['USER'])
def get_contacts(current_user):
    contacts = TrustedContact.query.filter_by(user_id=current_user.id).order_by(TrustedContact.id.asc()).all()
    return jsonify({
        'success': True,
        'contacts': [c.to_dict() for c in contacts]
    }), 200

@contact_bp.route('', methods=['POST'])
@token_required
@role_required(['USER'])
def add_contact(current_user):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    relationship = (data.get('relationship') or '').strip()
    phone = (data.get('phone') or '').strip()
    email = (data.get('email') or '').strip()
    is_emergency = bool(data.get('is_emergency_contact', True))
    can_view = bool(data.get('can_view_live_location', True))

    if not name or not relationship or not phone:
        return jsonify({'success': False, 'message': 'Name, relationship, and phone number are required.'}), 400
    if len(name) > 120 or len(relationship) > 60 or len(phone) > 30 or len(email) > 160:
        return jsonify({'success': False, 'message': 'One or more contact fields exceed the allowed length.'}), 400
    if not re.fullmatch(r'\+?[0-9][0-9\s()\-]{5,28}', phone):
        return jsonify({'success': False, 'message': 'Enter a valid contact phone number.'}), 400
    if email and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        return jsonify({'success': False, 'message': 'Enter a valid contact email address.'}), 400
    if is_emergency and not email:
        return jsonify({'success': False, 'message': 'An email address is required for an emergency contact because SMS alerts are not configured.'}), 400

    new_contact = TrustedContact(
        user_id=current_user.id,
        name=name,
        relationship=relationship,
        phone=phone,
        email=email or None,
        is_emergency_contact=is_emergency,
        can_view_live_location=can_view
    )
    db.session.add(new_contact)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f"Added {name} to your Trusted Circle.",
        'contact': new_contact.to_dict()
    }), 201

@contact_bp.route('/<int:contact_id>', methods=['PUT'])
@token_required
@role_required(['USER'])
def update_contact(current_user, contact_id):
    contact = TrustedContact.query.filter_by(id=contact_id, user_id=current_user.id).first()
    if not contact:
        return jsonify({'success': False, 'message': 'Trusted contact not found.'}), 404

    data = request.get_json() or {}
    if 'name' in data and (data.get('name') or '').strip():
        name = data['name'].strip()
        if len(name) > 120:
            return jsonify({'success': False, 'message': 'Contact name is too long.'}), 400
        contact.name = name
    if 'relationship' in data and (data.get('relationship') or '').strip():
        relationship = data['relationship'].strip()
        if len(relationship) > 60:
            return jsonify({'success': False, 'message': 'Relationship is too long.'}), 400
        contact.relationship = relationship
    if 'phone' in data and (data.get('phone') or '').strip():
        phone = data['phone'].strip()
        if len(phone) > 30 or not re.fullmatch(r'\+?[0-9][0-9\s()\-]{5,28}', phone):
            return jsonify({'success': False, 'message': 'Enter a valid contact phone number.'}), 400
        contact.phone = phone
    if 'email' in data:
        email = (data.get('email') or '').strip()
        if len(email) > 160 or (email and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email)):
            return jsonify({'success': False, 'message': 'Enter a valid contact email address.'}), 400
        contact.email = email or None
    if 'is_emergency_contact' in data:
        contact.is_emergency_contact = bool(data['is_emergency_contact'])
    if 'can_view_live_location' in data:
        contact.can_view_live_location = bool(data['can_view_live_location'])
    if contact.is_emergency_contact and not contact.email:
        return jsonify({'success': False, 'message': 'An email address is required for an emergency contact because SMS alerts are not configured.'}), 400

    db.session.commit()
    return jsonify({
        'success': True,
        'message': 'Contact updated successfully.',
        'contact': contact.to_dict()
    }), 200

@contact_bp.route('/<int:contact_id>', methods=['DELETE'])
@token_required
@role_required(['USER'])
def delete_contact(current_user, contact_id):
    contact = TrustedContact.query.filter_by(id=contact_id, user_id=current_user.id).first()
    if not contact:
        return jsonify({'success': False, 'message': 'Trusted contact not found.'}), 404

    db.session.delete(contact)
    db.session.commit()
    return jsonify({
        'success': True,
        'message': f"Removed {contact.name} from your Trusted Circle."
    }), 200
