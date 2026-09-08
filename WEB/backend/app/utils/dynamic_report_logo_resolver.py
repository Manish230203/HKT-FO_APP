"""
Dynamic Report Logo & Company Metadata Resolver Utility
--------------------------------------------------------
This module dynamically determines the correct company details (UDF vs EISPL/Eagle)
and logo asset paths for any submitted field officer visit report.

Usage by colleague:
  from app.utils.dynamic_report_logo_resolver import apply_dynamic_logo_to_reports, resolve_report_company_and_logo
"""

from typing import Dict, Any, List


def resolve_report_company_and_logo(report: Dict[str, Any]) -> Dict[str, Any]:
    """
    Dynamically inspects a report object (or database row dict) and attaches
    the correct company name, company short name, logo filename, and logo URL.
    """
    if not isinstance(report, dict):
        return report

    comp_id = report.get("company_id") or report.get("companyId") or report.get("COMPANY") or 1
    try:
        comp_id = int(comp_id)
    except (ValueError, TypeError):
        comp_id = 1

    comp_name = str(report.get("company_name") or report.get("companyName") or report.get("company") or "").lower()
    officer_name = str(report.get("officer") or report.get("officer_name") or report.get("officerName") or "").lower()

    # Determine if company is Eagle Industrial Services Pvt. Ltd. (EISPL)
    is_eagle = (
        comp_id == 4 or
        "eagle" in comp_name or
        "eispl" in comp_name or
        "anil bhosale" in officer_name or
        "bhosale" in officer_name
    )

    if is_eagle:
        company_details = {
            "company_name": "Eagle Industrial Services Pvt. Ltd.",
            "companyName": "Eagle Industrial Services Pvt. Ltd.",
            "company_short_name": "EISPL",
            "companyShortName": "EISPL",
            "company_id": 4,
            "companyId": 4,
            "company_logo_filename": "eagle_logo.png",
            "company_logo_url": "/assets/images/eagle_logo.png",
            "company_logo_backend_url": "/static/uploads/eagle_logo.png",
            "is_eagle": True
        }
    else:
        company_details = {
            "company_name": "Unique Delta Force Security Pvt. Ltd.",
            "companyName": "Unique Delta Force Security Pvt. Ltd.",
            "company_short_name": "UDF",
            "companyShortName": "UDF",
            "company_id": 1,
            "companyId": 1,
            "company_logo_filename": "udf_logo.png",
            "company_logo_url": "/assets/images/udf_logo.png",
            "company_logo_backend_url": "/static/uploads/udf_logo.png",
            "is_eagle": False
        }

    # Inject resolved company fields into the report object
    report.update(company_details)
    return report


def apply_dynamic_logo_to_reports(reports: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Batch helper: Accepts a list of report dictionaries and applies
    dynamic company and logo resolution to each report in the list.
    """
    if not reports or not isinstance(reports, list):
        return reports or []
    
    return [resolve_report_company_and_logo(rep) for rep in reports]


if __name__ == "__main__":
    print("==========================================================")
    print("Testing Dynamic Report Logo Resolver Utility Script...")
    print("==========================================================")

    sample_reports = [
        {
            "report_id": "REP-101",
            "officer": "Amit Kulkarni",
            "site_name": "BSES Rajdhani Power",
            "company_name": "Unique Delta Force Security Pvt. Ltd."
        },
        {
            "report_id": "REP-102",
            "officer": "Anil Bhosale",
            "site_name": "Danfoss Magarpatta",
            "company_name": "Eagle Industrial Services Pvt. Ltd."
        },
        {
            "report_id": "REP-103",
            "officer": "Rahul Sharma",
            "company_id": 4,
            "site_name": "Capgemini"
        }
    ]

    resolved_reports = apply_dynamic_logo_to_reports(sample_reports)

    for i, rep in enumerate(resolved_reports, 1):
        print(f"\nReport #{i}: {rep.get('report_id')}")
        print(f"  Officer       : {rep.get('officer')}")
        print(f"  Company Name  : {rep.get('companyName')}")
        print(f"  Short Name    : {rep.get('companyShortName')}")
        print(f"  Logo Filename : {rep.get('company_logo_filename')}")
        print(f"  Logo Web URL  : {rep.get('company_logo_url')}")

    print("\nTest finished successfully!")
