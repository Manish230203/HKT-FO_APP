from geopy.distance import geodesic
from app.config import OFFICE_LOCATION, ALLOWED_RADIUS

def is_within_radius(lat, long):
    return geodesic(OFFICE_LOCATION, (lat, long)).meters <= ALLOWED_RADIUS
