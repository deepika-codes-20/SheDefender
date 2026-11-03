import re
from flask import Blueprint, request, jsonify
from backend.app.models import db, User, Notification
from backend.app.auth.decorators import token_required
from sqlalchemy import or_

user_bp = Blueprint('user', __name__, url_prefix='/api/user')

@user_bp.route('/profile', methods=['GET'])
@token_required
def get_profile(current_user):
    return jsonify({
        'success': True,
        'user': current_user.to_dict()
    }), 200

@user_bp.route('/profile', methods=['PUT'])
@token_required
def update_profile(current_user):
    data = request.get_json() or {}
    
    if 'name' in data and (data.get('name') or '').strip():
        name = data['name'].strip()
        if len(name) > 120:
            return jsonify({'success': False, 'message': 'Name must be at most 120 characters.'}), 400
        current_user.name = name
    if 'phone' in data:
        phone = (data.get('phone') or '').strip() or None
        if phone and (len(phone) > 30 or not re.fullmatch(r'\+?\d{7,15}', re.sub(r'[\s()-]', '', phone))):
            return jsonify({'success': False, 'message': 'Enter a valid phone number with 7 to 15 digits.'}), 400
        if phone:
            phone = re.sub(r'[\s()-]', '', phone)
            existing = User.query.filter(User.phone == phone, User.id != current_user.id).first()
            if existing:
                return jsonify({'success': False, 'message': 'This phone number is already in use.'}), 409
        current_user.phone = phone
    if 'avatar_url' in data:
        current_user.avatar_url = data['avatar_url']

    db.session.commit()
    return jsonify({
        'success': True,
        'message': 'Profile updated successfully.',
        'user': current_user.to_dict()
    }), 200

@user_bp.route('/notifications', methods=['GET'])
@token_required
def get_notifications(current_user):
    notifs = Notification.query.filter_by(user_id=current_user.id).order_by(Notification.id.desc()).limit(20).all()
    return jsonify({
        'success': True,
        'notifications': [n.to_dict() for n in notifs]
    }), 200

@user_bp.route('/notifications/<int:notification_id>/read', methods=['PUT'])
@token_required
def mark_notification_read(current_user, notification_id):
    notif = Notification.query.filter_by(id=notification_id, user_id=current_user.id).first()
    if not notif:
        return jsonify({'success': False, 'message': 'Notification not found.'}), 404
        
    notif.is_read = True
    db.session.commit()
    return jsonify({'success': True, 'message': 'Marked as read.'}), 200
