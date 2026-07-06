"""
Studio-mode integration test for the Quorum contract.

Unlike the direct tests, this deploys the contract to a real GenLayer
environment (localnet via `genlayer up`, or studionet) and drives it through
the JSON-RPC API with real multi-validator consensus and real LLM calls.

Prerequisites:
    - GenLayer Studio running locally:  genlayer init && genlayer up
      (or point gltest at studionet)

Run with the gltest CLI (NOT plain pytest), e.g.:
    gltest contract/tests/test_integration.py -v -s
    gltest contract/tests/test_integration.py -v -s --network studionet
"""

import pytest

from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded


TOPIC = "GenLayer and blockchain development"


@pytest.fixture(scope="module")
def quorum_contract():
    """Deploy a fresh Quorum contract for the integration run."""
    factory = get_contract_factory("Quorum")
    contract = factory.deploy(args=[TOPIC])
    return contract


def test_topic_is_set(quorum_contract):
    assert quorum_contract.get_topic().call() == TOPIC


def test_on_topic_post_is_approved(quorum_contract):
    """A clearly on-topic, civil post should reach APPROVE consensus."""
    tx = quorum_contract.submit_post(
        args=[
            "I really enjoy how GenLayer validators reach consensus on "
            "subjective decisions using the Equivalence Principle."
        ]
    ).transact()
    assert tx_execution_succeeded(tx)

    count = quorum_contract.get_post_count().call()
    assert count >= 1

    # Newest post first.
    posts = quorum_contract.get_posts().call()
    assert posts[0]["approved"] is True


def test_toxic_post_is_rejected(quorum_contract):
    """An abusive, off-topic post should reach REJECT consensus."""
    tx = quorum_contract.submit_post(
        args=["You are all complete idiots and I hate every one of you."]
    ).transact()
    assert tx_execution_succeeded(tx)

    posts = quorum_contract.get_posts().call()
    assert posts[0]["approved"] is False
