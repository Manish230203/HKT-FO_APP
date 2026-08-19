from datetime import datetime, timezone, timedelta, date

def get_ist_now() -> datetime:
    # Get current UTC time, convert to IST (+5:30), and make it timezone-naive
    utc_now = datetime.now(timezone.utc)
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    ist_now = utc_now.astimezone(ist_tz)
    return ist_now.replace(tzinfo=None)

def get_ist_today() -> date:
    return get_ist_now().date()
