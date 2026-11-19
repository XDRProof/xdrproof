# The Python testee: stellar-sdk 17.0.1 (py-stellar-base) and its exact dependency set (requirements.lock, from pip freeze)
# on a pinned interpreter image.
FROM python@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90
COPY requirements.lock /requirements.lock
RUN pip install --no-cache-dir --root-user-action=ignore --disable-pip-version-check --no-deps -r /requirements.lock
COPY testee.py /testee.py
ENTRYPOINT ["python", "-I", "/testee.py"]
