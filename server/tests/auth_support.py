"""Real Users transport against a loopback provider; never uses live accounts."""
import os
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import grpc

from users import users_pb2 as messages
from users import users_pb2_grpc as services


class UsersProvider(services.UsersServiceServicer):
    def __init__(self, agency="AUS", user_id="user-1", profile=None, profile_error=None):
        self.agency = agency
        self.user_id = user_id
        self.profile = profile
        self.profile_error = profile_error

    def ValidateAccessToken(self, request, context):
        if request.access_token != "isolated-access-token":
            context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid access token")
        return messages.ValidateAccessTokenResponse(
            user_id=self.user_id, agency_code=self.agency,
        )

    def GetProfile(self, request, context):
        if request.access_token != "isolated-access-token":
            context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid access token")
        if self.profile_error:
            context.abort(self.profile_error, "Profile temporarily unavailable")
        return messages.ProfileResponse(user=self.profile if self.profile is not None else messages.User(
            id=self.user_id, agency_code=self.agency, username="trusted.staff",
        ))


def authenticate(test, agency="AUS", user_id="user-1", profile=None, profile_error=None):
    provider = UsersProvider(agency, user_id, profile, profile_error)
    server = grpc.server(ThreadPoolExecutor(max_workers=2))
    services.add_UsersServiceServicer_to_server(provider, server)
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    test.addCleanup(lambda: server.stop(0).wait())
    env = patch.dict(os.environ, {
        "USERS_GRPC_TARGET": f"http://127.0.0.1:{port}",
        "USERS_API_TIMEOUT_SECONDS": "2",
    })
    env.start()
    test.addCleanup(env.stop)
    return {"Authorization": "Bearer isolated-access-token"}
